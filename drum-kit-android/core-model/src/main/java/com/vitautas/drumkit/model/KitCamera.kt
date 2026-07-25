package com.vitautas.drumkit.model

/**
 * Fixed screen-space camera contract for the studio kit.
 *
 * Ellipse compression is the projected minor-axis to major-axis ratio at the
 * reference landscape viewport. Instrument placement remains separate so the
 * camera can be applied consistently during the Phase 2 layout work.
 */
object StudioKitCamera {
    const val ELEVATION_DEGREES = 24f
    const val HORIZON_Y = 0.68f
    const val FLOOR_PLANE_Y = 0.94f
    const val REFERENCE_VIEWPORT_ASPECT_RATIO = 1536f / 707f
    const val DRUM_HEAD_ELLIPSE_COMPRESSION = 0.27f
    const val CYMBAL_ELLIPSE_COMPRESSION = 0.18f

    const val DRUM_HEAD_HEIGHT_FRACTION_OF_DRAW_BOUNDS = 0.42f
    const val CYMBAL_HEIGHT_FRACTION_OF_DRAW_BOUNDS = 0.54f

    fun projectedDrumHeadHeight(normalizedWidth: Float): Float =
        projectedEllipseHeight(normalizedWidth, DRUM_HEAD_ELLIPSE_COMPRESSION)

    fun projectedCymbalHeight(normalizedWidth: Float): Float =
        projectedEllipseHeight(normalizedWidth, CYMBAL_ELLIPSE_COMPRESSION)

    fun drumDrawBoundsHeight(normalizedWidth: Float): Float =
        projectedDrumHeadHeight(normalizedWidth) / DRUM_HEAD_HEIGHT_FRACTION_OF_DRAW_BOUNDS

    fun cymbalDrawBoundsHeight(normalizedWidth: Float): Float =
        projectedCymbalHeight(normalizedWidth) / CYMBAL_HEIGHT_FRACTION_OF_DRAW_BOUNDS

    private fun projectedEllipseHeight(normalizedWidth: Float, compression: Float): Float {
        require(normalizedWidth.isFinite() && normalizedWidth in 0f..1f) {
            "normalized width must be finite and within the normalized coordinate space"
        }
        return normalizedWidth * REFERENCE_VIEWPORT_ASPECT_RATIO * compression
    }
}
