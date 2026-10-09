import { MUSCLE_MAP_SIZES, MUSCLE_MASKS, type MuscleMapView } from './muscleMasks'
import { BACK_GROUP_CONTOURS } from './backMuscleContours'

// Use each artwork's own coordinate system: front and back are different sizes.
export function mapBounds(view: MuscleMapView, zoom = false, legs = false) {
  const { width: w, height: h } = MUSCLE_MAP_SIZES[view]
  return zoom ? (legs ? `${w * .23} ${h * .51} ${w * .54} ${h * .45}` : `${w * .2} ${h * .13} ${w * .6} ${h * .39}`) : `0 0 ${w} ${h}`
}
export function groupMasks(view: MuscleMapView) {
  const masks = MUSCLE_MASKS[view]
  return view === 'back' ? [...masks.filter(mask => !BACK_GROUP_CONTOURS.some(group => group.muscle === mask.muscle)), ...BACK_GROUP_CONTOURS] : masks
}
