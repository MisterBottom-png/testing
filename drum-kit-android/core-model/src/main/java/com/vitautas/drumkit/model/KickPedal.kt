package com.vitautas.drumkit.model

enum class StrikeInputTarget(val wireName: String) {
    INSTRUMENT_SURFACE("instrument_surface"),
    KICK_PEDAL("kick_pedal"),
}

data class StudioKitInputCandidate(
    val instrument: InstrumentId,
    val inputTarget: StrikeInputTarget,
)

data class StudioKitInputHit(
    val definition: InstrumentDefinition,
    val normalizedX: Float,
    val normalizedY: Float,
    val inputTarget: StrikeInputTarget,
)

/**
 * Screen-space model for a single-chain kick pedal mounted in front of the bass drum.
 *
 * The touch target is deliberately larger than the rendered footboard. A pedal hit
 * always produces one fixed beater impact point on the kick head; finger position on
 * the board changes the interaction animation, not the acoustic strike location.
 */
object KickPedalDefinition {
    const val HIT_TEST_PRIORITY = 110

    val visualBounds = NormalizedRect(
        left = 0.405f,
        top = 0.64f,
        right = 0.615f,
        bottom = 0.995f,
    )
    val footboardBounds = NormalizedRect(
        left = 0.455f,
        top = 0.78f,
        right = 0.565f,
        bottom = 0.975f,
    )
    val hitRegion = PolygonHitRegion(
        points = listOf(
            NormalizedPoint(0.405f, 0.735f),
            NormalizedPoint(0.615f, 0.735f),
            NormalizedPoint(0.635f, 0.995f),
            NormalizedPoint(0.385f, 0.995f),
        ),
    )
    val axle = NormalizedPoint(0.51f, 0.785f)
    val beaterRestHead = NormalizedPoint(0.474f, 0.685f)
    val beaterImpactHead = NormalizedPoint(0.51f, 0.64f)
    val kickImpact = NormalizedPoint(0.5f, 0.39f)
    val labelPosition = NormalizedPoint(0.51f, 0.91f)

    fun contains(screenX: Float, screenY: Float): Boolean = hitRegion.contains(screenX, screenY)
}

/** Shared target priority for runtime input, diagnostics, and tests. */
object StudioKitInputGeometry {
    private val kickDefinition = StudioKitDefinition.instruments.first { it.id == InstrumentId.KICK }

    fun hitTest(
        screenX: Float,
        screenY: Float,
        aspectRatio: Float,
    ): StudioKitInputHit? {
        validateInput(screenX, screenY, aspectRatio)
        if (KickPedalDefinition.contains(screenX, screenY)) {
            return StudioKitInputHit(
                definition = kickDefinition,
                normalizedX = KickPedalDefinition.kickImpact.x,
                normalizedY = KickPedalDefinition.kickImpact.y,
                inputTarget = StrikeInputTarget.KICK_PEDAL,
            )
        }

        val surfaceHit = StudioKitGeometry.hitTest(screenX, screenY, aspectRatio) ?: return null
        return StudioKitInputHit(
            definition = surfaceHit.definition,
            normalizedX = surfaceHit.normalizedX,
            normalizedY = surfaceHit.normalizedY,
            inputTarget = StrikeInputTarget.INSTRUMENT_SURFACE,
        )
    }

    fun candidates(
        screenX: Float,
        screenY: Float,
        aspectRatio: Float,
    ): List<StudioKitInputCandidate> {
        validateInput(screenX, screenY, aspectRatio)
        return buildList(StudioKitDefinition.instruments.size + 1) {
            if (KickPedalDefinition.contains(screenX, screenY)) {
                add(StudioKitInputCandidate(InstrumentId.KICK, StrikeInputTarget.KICK_PEDAL))
            }
            for (definition in StudioKitDefinition.hitTestOrder) {
                if (StudioKitGeometry.contains(definition.layout, screenX, screenY, aspectRatio)) {
                    add(StudioKitInputCandidate(definition.id, StrikeInputTarget.INSTRUMENT_SURFACE))
                }
            }
        }
    }

    fun matchingTargetCount(screenX: Float, screenY: Float, aspectRatio: Float): Int {
        validateInput(screenX, screenY, aspectRatio)
        return StudioKitGeometry.matchingInstrumentCount(screenX, screenY, aspectRatio) +
            if (KickPedalDefinition.contains(screenX, screenY)) 1 else 0
    }

    private fun validateInput(screenX: Float, screenY: Float, aspectRatio: Float) {
        require(screenX.isFinite() && screenY.isFinite()) { "screen point must be finite" }
        require(aspectRatio.isFinite() && aspectRatio > 0f) {
            "aspect ratio must be positive and finite"
        }
    }
}
