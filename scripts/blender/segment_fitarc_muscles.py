"""Create and assign Fitarc muscle materials on a Mixamo-skinned body.

Run this file inside Blender after selecting the character's body mesh:

1. Save a backup copy of the .blend file.
2. Select the body mesh in Object Mode.
3. Open Blender's Scripting workspace and load this file.
4. Press Run Script.
5. In Solid viewport shading, set Color Type to Material to inspect the result.

The classifier combines Mixamo vertex weights with normalized body position and
surface direction. It is intended to produce a fast first pass, not medical
segmentation. It does not change geometry, the armature, or skin weights.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from statistics import median
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import bpy
from mathutils import Vector


# Preserve material regions that were assigned by hand before running the script.
PRESERVE_EXISTING_MUSCLE_ASSIGNMENTS = True

# Set this to True only if chest/back and quads/hamstrings appear reversed.
FLIP_FRONT_BACK = False

# Faces below this average semantic skin-weight confidence remain skin.base.
MIN_CLASSIFICATION_WEIGHT = 0.12

ORIGINAL_MATERIAL_ATTRIBUTE = "fitarc_original_material_index"

MUSCLE_COLORS: Dict[str, Tuple[float, float, float, float]] = {
    "skin.base": (0.22, 0.16, 0.11, 1.0),
    "muscle.chest": (1.00, 0.28, 0.12, 1.0),
    "muscle.back": (0.96, 0.42, 0.12, 1.0),
    "muscle.shoulders": (1.00, 0.62, 0.15, 1.0),
    "muscle.biceps": (0.88, 0.22, 0.42, 1.0),
    "muscle.triceps": (0.72, 0.18, 0.48, 1.0),
    "muscle.forearms": (0.68, 0.30, 0.72, 1.0),
    "muscle.core": (0.98, 0.76, 0.16, 1.0),
    "muscle.glutes": (0.18, 0.66, 0.88, 1.0),
    "muscle.quads": (0.14, 0.76, 0.48, 1.0),
    "muscle.hamstrings": (0.10, 0.56, 0.62, 1.0),
    "muscle.calves": (0.30, 0.48, 0.92, 1.0),
}


@dataclass(frozen=True)
class BodyBasis:
    origin: Vector
    right: Vector
    front: Vector
    up: Vector
    height_min: float
    height_max: float
    front_slices: Tuple[Tuple[float, float], ...]

    @property
    def height(self) -> float:
        return max(self.height_max - self.height_min, 1e-6)


def normalized_bone_name(name: str) -> str:
    return name.rsplit(":", 1)[-1].replace("_", "").replace(" ", "").lower()


def find_body_mesh() -> bpy.types.Object:
    active = bpy.context.active_object
    if active and active.type == "MESH":
        return active

    candidates = [
        obj
        for obj in bpy.context.scene.objects
        if obj.type == "MESH" and obj.find_armature() is not None
    ]
    if not candidates:
        raise RuntimeError(
            "No skinned body mesh found. Select the Mixamo body mesh and run again."
        )
    return max(candidates, key=lambda obj: len(obj.data.vertices))


def find_bone(armature: bpy.types.Object, *aliases: str) -> Optional[bpy.types.Bone]:
    aliases_normalized = {normalized_bone_name(alias) for alias in aliases}
    for bone in armature.data.bones:
        if normalized_bone_name(bone.name) in aliases_normalized:
            return bone
    return None


def bone_head_world(armature: bpy.types.Object, *aliases: str) -> Optional[Vector]:
    bone = find_bone(armature, *aliases)
    if bone is None:
        return None
    return armature.matrix_world @ bone.head_local


def projected(vector: Vector, axis: Vector) -> Vector:
    return vector - axis * vector.dot(axis)


def percentile(values: Sequence[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * fraction)))
    return ordered[index]


def build_front_slices(
    points: Iterable[Vector], origin: Vector, up: Vector, front: Vector, count: int = 48
) -> Tuple[Tuple[float, float], ...]:
    samples = [(point - origin).dot(up) for point in points]
    low, high = min(samples), max(samples)
    span = max(high - low, 1e-6)
    buckets: List[List[float]] = [[] for _ in range(count)]

    for point in points:
        z = (point - origin).dot(up)
        bucket = min(count - 1, max(0, int(((z - low) / span) * count)))
        buckets[bucket].append((point - origin).dot(front))

    all_front = [value for bucket in buckets for value in bucket]
    global_mid = median(all_front)
    global_half_depth = max(
        (percentile(all_front, 0.90) - percentile(all_front, 0.10)) * 0.5,
        1e-6,
    )

    result: List[Tuple[float, float]] = []
    for bucket in buckets:
        if len(bucket) < 8:
            result.append((global_mid, global_half_depth))
            continue
        local_mid = median(bucket)
        local_half_depth = max(
            (percentile(bucket, 0.90) - percentile(bucket, 0.10)) * 0.5,
            global_half_depth * 0.15,
        )
        result.append((local_mid, local_half_depth))
    return tuple(result)


def infer_body_basis(mesh: bpy.types.Object, armature: bpy.types.Object) -> BodyBasis:
    hips = bone_head_world(armature, "Hips")
    head = bone_head_world(armature, "Head", "Neck")
    left_hip = bone_head_world(armature, "LeftUpLeg")
    right_hip = bone_head_world(armature, "RightUpLeg")

    if hips is None or head is None or left_hip is None or right_hip is None:
        raise RuntimeError(
            "Required Mixamo bones were not found: Hips, Head, LeftUpLeg, RightUpLeg."
        )

    up = (head - hips).normalized()
    right = projected(right_hip - left_hip, up).normalized()

    toe_vectors: List[Vector] = []
    for side in ("Left", "Right"):
        foot = bone_head_world(armature, f"{side}Foot")
        toe = bone_head_world(armature, f"{side}ToeBase")
        if foot is not None and toe is not None:
            toe_vectors.append(toe - foot)

    if toe_vectors:
        toe_direction = sum(toe_vectors, Vector((0.0, 0.0, 0.0))) / len(toe_vectors)
        front = projected(projected(toe_direction, up), right)
        if front.length < 1e-6:
            front = right.cross(up)
    else:
        front = right.cross(up)
    front.normalize()

    # Re-orthogonalize the basis to avoid small FBX conversion errors.
    right = up.cross(front).normalized()
    front = right.cross(up).normalized()
    if FLIP_FRONT_BACK:
        front.negate()

    world_points = [mesh.matrix_world @ vertex.co for vertex in mesh.data.vertices]
    heights = [(point - hips).dot(up) for point in world_points]

    return BodyBasis(
        origin=hips,
        right=right,
        front=front,
        up=up,
        height_min=min(heights),
        height_max=max(heights),
        front_slices=build_front_slices(world_points, hips, up, front),
    )


def semantic_group(name: str) -> Optional[str]:
    bone = normalized_bone_name(name)
    if "head" in bone or bone == "neck":
        return "head"
    if "hand" in bone or "thumb" in bone or "index" in bone or "middle" in bone or "ring" in bone or "pinky" in bone:
        return "hand"
    if "foot" in bone or "toe" in bone:
        return "foot"
    if "shoulder" in bone:
        return "shoulder"
    if "forearm" in bone:
        return "forearm"
    if bone.endswith("arm"):
        return "upper_arm"
    if "upleg" in bone or "thigh" in bone:
        return "thigh"
    if bone.endswith("leg") or "calf" in bone or "shin" in bone:
        return "lower_leg"
    if bone == "hips" or bone == "pelvis":
        return "hips"
    if bone.startswith("spine"):
        return "torso"
    return None


def polygon_semantic_weights(
    mesh: bpy.types.Object, polygon: bpy.types.MeshPolygon
) -> Dict[str, float]:
    totals: Dict[str, float] = defaultdict(float)
    vertex_count = max(len(polygon.vertices), 1)

    for vertex_index in polygon.vertices:
        vertex = mesh.data.vertices[vertex_index]
        for assignment in vertex.groups:
            group_name = mesh.vertex_groups[assignment.group].name
            semantic = semantic_group(group_name)
            if semantic:
                totals[semantic] += assignment.weight / vertex_count
    return totals


def local_front_ratio(
    center: Vector, normal: Vector, basis: BodyBasis, height_normalized: float
) -> float:
    count = len(basis.front_slices)
    index = min(count - 1, max(0, int(height_normalized * count)))
    local_mid, local_half_depth = basis.front_slices[index]
    position_score = ((center - basis.origin).dot(basis.front) - local_mid) / local_half_depth
    normal_score = normal.dot(basis.front)
    return position_score * 0.82 + normal_score * 0.18


def classify_polygon(
    mesh: bpy.types.Object,
    polygon: bpy.types.MeshPolygon,
    basis: BodyBasis,
) -> str:
    weights = polygon_semantic_weights(mesh, polygon)
    if not weights:
        return "skin.base"

    center = mesh.matrix_world @ polygon.center
    normal = (mesh.matrix_world.to_3x3().inverted().transposed() @ polygon.normal).normalized()
    height = (center - basis.origin).dot(basis.up)
    z = (height - basis.height_min) / basis.height
    front = local_front_ratio(center, normal, basis, z)
    is_front = front >= 0.0

    excluded = weights.get("head", 0.0) + weights.get("hand", 0.0) + weights.get("foot", 0.0)
    classifiable = {
        key: value
        for key, value in weights.items()
        if key not in {"head", "hand", "foot"}
    }
    strongest_part, strongest_weight = max(
        classifiable.items(), key=lambda item: item[1], default=("", 0.0)
    )

    if excluded > strongest_weight or strongest_weight < MIN_CLASSIFICATION_WEIGHT:
        return "skin.base"

    if z > 0.88 or z < 0.07:
        return "skin.base"

    shoulder_weight = weights.get("shoulder", 0.0)
    upper_arm_weight = weights.get("upper_arm", 0.0)
    if shoulder_weight >= 0.14 or (
        strongest_part == "upper_arm" and z >= 0.73 and shoulder_weight + upper_arm_weight >= 0.45
    ):
        return "muscle.shoulders"

    if strongest_part == "forearm":
        return "muscle.forearms"

    if strongest_part == "upper_arm":
        return "muscle.biceps" if is_front else "muscle.triceps"

    if strongest_part == "lower_leg":
        return "muscle.calves"

    if strongest_part == "thigh":
        if not is_front and z >= 0.46:
            return "muscle.glutes"
        return "muscle.quads" if is_front else "muscle.hamstrings"

    if strongest_part == "hips":
        return "muscle.core" if is_front else "muscle.glutes"

    if strongest_part == "torso":
        if is_front:
            return "muscle.chest" if z >= 0.64 else "muscle.core"
        return "muscle.back"

    return "skin.base"


def ensure_materials(mesh: bpy.types.Object) -> Dict[str, int]:
    slots = mesh.data.materials
    materials_by_name = {material.name: material for material in slots if material}

    base = materials_by_name.get("skin.base")
    if base is None:
        base = mesh.active_material
        if base is None:
            base = bpy.data.materials.new("skin.base")
            base.use_nodes = True
            slots.append(base)
        else:
            base.name = "skin.base"

    for name, color in MUSCLE_COLORS.items():
        material = next((item for item in slots if item and item.name == name), None)
        if material is None:
            material = base.copy() if name != "skin.base" else base
            material.name = name
            slots.append(material)
        material.diffuse_color = color
        material["fitarc_region"] = name

    return {
        material.name: index
        for index, material in enumerate(slots)
        if material and material.name in MUSCLE_COLORS
    }


def preserve_original_material_indices(mesh: bpy.types.Object) -> None:
    attributes = mesh.data.attributes
    attribute = attributes.get(ORIGINAL_MATERIAL_ATTRIBUTE)
    if attribute is None:
        attribute = attributes.new(
            name=ORIGINAL_MATERIAL_ATTRIBUTE,
            type="INT",
            domain="FACE",
        )
        for polygon in mesh.data.polygons:
            attribute.data[polygon.index].value = polygon.material_index


def existing_material_name(mesh: bpy.types.Object, polygon: bpy.types.MeshPolygon) -> str:
    if polygon.material_index >= len(mesh.data.materials):
        return ""
    material = mesh.data.materials[polygon.material_index]
    return material.name if material else ""


def segment() -> None:
    if bpy.context.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")

    mesh = find_body_mesh()
    armature = mesh.find_armature()
    if armature is None:
        raise RuntimeError("The selected mesh has no Armature modifier.")

    bpy.context.view_layer.objects.active = mesh
    mesh.select_set(True)

    material_indices = ensure_materials(mesh)
    preserve_original_material_indices(mesh)
    basis = infer_body_basis(mesh, armature)
    counts: Counter[str] = Counter()
    preserved = 0

    for polygon in mesh.data.polygons:
        current_name = existing_material_name(mesh, polygon)
        if PRESERVE_EXISTING_MUSCLE_ASSIGNMENTS and current_name.startswith("muscle."):
            counts[current_name] += 1
            preserved += 1
            continue

        region = classify_polygon(mesh, polygon, basis)
        polygon.material_index = material_indices[region]
        counts[region] += 1

    mesh["fitarc_segmented"] = True
    mesh["fitarc_front_axis"] = tuple(round(value, 6) for value in basis.front)
    mesh["fitarc_up_axis"] = tuple(round(value, 6) for value in basis.up)
    mesh.data.update()

    print("\n=== Fitarc muscle segmentation complete ===")
    print(f"Mesh: {mesh.name}")
    print(f"Armature: {armature.name}")
    print(f"Faces: {len(mesh.data.polygons)}")
    print(f"Previously assigned muscle faces preserved: {preserved}")
    for name in MUSCLE_COLORS:
        print(f"  {name:20s} {counts[name]:8d} faces")
    print("Inspect in Solid shading with Color Type set to Material.")
    print("If front/back regions are reversed, set FLIP_FRONT_BACK = True and rerun.\n")


if __name__ == "__main__":
    segment()
