"""Render a transparent, portrait login-background image from the Fitarc athlete.

Run with Blender in background mode against the segmented .blend file. The
script changes only the in-memory scene used for the render.
"""

from __future__ import annotations

import math
import os

import bpy
from mathutils import Matrix, Vector


OUTPUT_PATH = os.environ.get(
    "FITARC_LOGIN_RENDER",
    "/tmp/fitarc-login-athlete.png",
)
WIDTH = int(os.environ.get("FITARC_RENDER_WIDTH", "1024"))
HEIGHT = int(os.environ.get("FITARC_RENDER_HEIGHT", "1536"))
POSE_ARMS_DOWN = os.environ.get("FITARC_POSE_ARMS_DOWN", "1") == "1"


def body_mesh() -> bpy.types.Object:
    meshes = [
        obj
        for obj in bpy.context.scene.objects
        if obj.type == "MESH" and obj.find_armature() is not None
    ]
    if not meshes:
        raise RuntimeError("No skinned athlete mesh found.")
    return max(meshes, key=lambda obj: len(obj.data.vertices))


def evaluated_world_points(obj: bpy.types.Object) -> list[Vector]:
    dependency_graph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(dependency_graph)
    evaluated_mesh = evaluated.to_mesh()
    try:
        return [evaluated.matrix_world @ vertex.co for vertex in evaluated_mesh.vertices]
    finally:
        evaluated.to_mesh_clear()


def pose_bone_head_world(armature: bpy.types.Object, name: str) -> Vector:
    bone = armature.pose.bones.get(name)
    if bone is None:
        raise RuntimeError(f"Required Mixamo pose bone not found: {name}")
    return armature.matrix_world @ bone.head


def athlete_axes(mesh: bpy.types.Object) -> tuple[Vector, Vector]:
    """Return front and up from the evaluated pose, after FBX axis conversion."""
    armature = mesh.find_armature()
    if armature is None:
        raise RuntimeError("Athlete mesh has no armature.")

    hips = pose_bone_head_world(armature, "mixamorig:Hips")
    head = pose_bone_head_world(armature, "mixamorig:Head")
    left_hip = pose_bone_head_world(armature, "mixamorig:LeftUpLeg")
    right_hip = pose_bone_head_world(armature, "mixamorig:RightUpLeg")
    up = (head - hips).normalized()
    right = (right_hip - left_hip)
    right = (right - up * right.dot(up)).normalized()

    toe_vectors = []
    for side in ("Left", "Right"):
        foot = pose_bone_head_world(armature, f"mixamorig:{side}Foot")
        toe = pose_bone_head_world(armature, f"mixamorig:{side}ToeBase")
        toe_vectors.append(toe - foot)
    front = sum(toe_vectors, Vector((0.0, 0.0, 0.0))) / len(toe_vectors)
    front = front - up * front.dot(up) - right * front.dot(right)
    if front.length < 1e-6:
        front = right.cross(up)
    front.normalize()
    return front, up


def lower_arms(mesh: bpy.types.Object) -> None:
    armature = mesh.find_armature()
    if armature is None:
        return

    front_world, up_world = athlete_axes(mesh)
    front_local = (armature.matrix_world.to_3x3().inverted() @ front_world).normalized()

    for bone_name in ("mixamorig:LeftArm", "mixamorig:RightArm"):
        pose_bone = armature.pose.bones.get(bone_name)
        if pose_bone is None:
            continue

        original_matrix = pose_bone.matrix.copy()
        pivot = pose_bone.head.copy()
        best_matrix = None
        best_downward_score = float("inf")

        for sign in (-1.0, 1.0):
            rotation = Matrix.Rotation(sign * math.radians(68.0), 4, front_local)
            pose_bone.matrix = (
                Matrix.Translation(pivot)
                @ rotation
                @ Matrix.Translation(-pivot)
                @ original_matrix
            )
            bpy.context.view_layer.update()
            head = armature.matrix_world @ pose_bone.head
            tail = armature.matrix_world @ pose_bone.tail
            downward_score = (tail - head).normalized().dot(up_world)
            if downward_score < best_downward_score:
                best_downward_score = downward_score
                best_matrix = pose_bone.matrix.copy()

        pose_bone.matrix = best_matrix
        # The imported Mixamo action is evaluated again when rendering. Key the
        # render-only override into the in-memory action so the lowered pose is
        # retained for the still image.
        pose_bone.keyframe_insert(
            data_path="rotation_quaternion",
            frame=bpy.context.scene.frame_current,
            group=bone_name,
        )

    bpy.context.view_layer.update()


def login_material() -> bpy.types.Material:
    material = bpy.data.materials.get("login.athlete")
    if material is None:
        material = bpy.data.materials.new("login.athlete")
    material.use_nodes = True
    material.diffuse_color = (0.018, 0.012, 0.008, 1.0)

    nodes = material.node_tree.nodes
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    fresnel = nodes.new("ShaderNodeFresnel")
    rim = nodes.new("ShaderNodeValToRGB")

    shader.inputs["Base Color"].default_value = (0.012, 0.008, 0.005, 1.0)
    shader.inputs["Roughness"].default_value = 0.66
    shader.inputs["Metallic"].default_value = 0.28
    fresnel.inputs["IOR"].default_value = 1.22
    rim.color_ramp.elements[0].position = 0.10
    rim.color_ramp.elements[0].color = (0.0, 0.0, 0.0, 1.0)
    rim.color_ramp.elements[1].position = 0.72
    rim.color_ramp.elements[1].color = (0.92, 0.16, 0.012, 1.0)
    material.node_tree.links.new(fresnel.outputs["Fac"], rim.inputs["Fac"])
    if "Emission Color" in shader.inputs:
        material.node_tree.links.new(rim.outputs["Color"], shader.inputs["Emission Color"])
        shader.inputs["Emission Strength"].default_value = 0.58
    material.node_tree.links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    return material


def replace_materials(mesh: bpy.types.Object) -> None:
    material = login_material()
    mesh.data.materials.clear()
    mesh.data.materials.append(material)
    for polygon in mesh.data.polygons:
        polygon.material_index = 0


def add_area_light(name: str, location: Vector, energy: float, size: float, color) -> None:
    light_data = bpy.data.lights.new(name=name, type="AREA")
    light_data.energy = energy
    light_data.shape = "DISK"
    light_data.size = size
    light_data.color = color
    light = bpy.data.objects.new(name, light_data)
    bpy.context.collection.objects.link(light)
    light.location = location
    light.rotation_euler = (Vector((0.0, 0.0, 0.0)) - location).to_track_quat("-Z", "Y").to_euler()


def set_camera(mesh: bpy.types.Object) -> None:
    points = evaluated_world_points(mesh)
    minimum = Vector(tuple(min(point[index] for point in points) for index in range(3)))
    maximum = Vector(tuple(max(point[index] for point in points) for index in range(3)))
    center = (minimum + maximum) * 0.5
    front, up = athlete_axes(mesh)
    right = up.cross(front).normalized()

    projected_width = max(abs((point - center).dot(right)) for point in points) * 2.0
    projected_height = max(abs((point - center).dot(up)) for point in points) * 2.0

    camera_data = bpy.data.cameras.new("LoginCamera")
    camera_data.type = "ORTHO"
    camera_data.lens = 55
    camera_data.ortho_scale = max(
        projected_height * 1.08,
        projected_width / (WIDTH / HEIGHT) * 1.08,
    )

    camera = bpy.data.objects.new("LoginCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = center + front * max(projected_height, projected_width) * 3.0
    # Camera local -Z looks toward the athlete while local Y follows the
    # athlete's skeleton-derived up axis. This avoids FBX axis-conversion roll.
    camera.rotation_euler = Matrix((right, up, front)).transposed().to_euler()
    bpy.context.scene.camera = camera

    distance = max(projected_height, projected_width) * 2.5
    add_area_light(
        "LoginKey",
        center + front * distance + right * distance * 0.55 + up * distance * 0.35,
        230.0,
        projected_height * 0.55,
        (1.0, 0.18, 0.025),
    )
    add_area_light(
        "LoginFill",
        center + front * distance - right * distance * 0.7,
        65.0,
        projected_height * 0.7,
        (0.10, 0.13, 0.18),
    )
    add_area_light(
        "LoginRim",
        center - front * distance + up * distance * 0.5,
        780.0,
        projected_height * 0.5,
        (1.0, 0.11, 0.012),
    )


def configure_render() -> None:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = WIDTH
    scene.render.resolution_y = HEIGHT
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = True
    scene.render.filepath = OUTPUT_PATH
    scene.render.image_settings.color_depth = "8"

    scene.world.color = (0.0, 0.0, 0.0)
    scene.view_settings.look = "AgX - Medium High Contrast"


def main() -> None:
    mesh = body_mesh()
    armature = mesh.find_armature()
    if POSE_ARMS_DOWN:
        lower_arms(mesh)
    replace_materials(mesh)

    for obj in bpy.context.scene.objects:
        if obj.type == "ARMATURE":
            obj.hide_render = True

    set_camera(mesh)
    configure_render()
    bpy.ops.render.render(write_still=True)
    print(f"Rendered login athlete to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
