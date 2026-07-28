package com.vitautas.drumkit.model

enum class StrikeInputTarget(val wireName: String) {
    INSTRUMENT_SURFACE("instrument_surface"),
    SNARE_RIM("snare_rim"),
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
    private const val SnareRimRadius = 0.88f
    private val kickDefinition = StudioKitDefinition.instruments.first { it.id == InstrumentId.KICK }
    private val snareDefinition = StudioKitDefinition.instruments.first { it.id == InstrumentId.SNARE }

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

        // The rim must be reachable even though the normal head target is intentionally inset.
        // It is resolved before the generic surface path because the snare owns the foreground.
        StudioKitGeometry.playableSurfaceHit(snareDefinition, screenX, screenY, aspectRatio)?.let { hit ->
            return StudioKitInputHit(
                definition = hit.definition,
                normalizedX = hit.normalizedX,
                normalizedY = hit.normalizedY,
                inputTarget = if (snareRadialDistance(hit) >= SnareRimRadius) {
                    StrikeInputTarget.SNARE_RIM
                } else {
                    StrikeInputTarget.INSTRUMENT_SURFACE
                },
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
            StudioKitGeometry.playableSurfaceHit(snareDefinition, screenX, screenY, aspectRatio)?.let { hit ->
                add(
                    StudioKitInputCandidate(
                        InstrumentId.SNARE,
                        if (snareRadialDistance(hit) >= SnareRimRadius) StrikeInputTarget.SNARE_RIM
                        else StrikeInputTarget.INSTRUMENT_SURFACE,
                    ),
                )
            }
            for (definition in StudioKitDefinition.hitTestOrder) {
                if (definition.id != InstrumentId.SNARE &&
                    StudioKitGeometry.contains(definition.layout, screenX, screenY, aspectRatio)
                ) {
                    add(StudioKitInputCandidate(definition.id, StrikeInputTarget.INSTRUMENT_SURFACE))
                }
            }
        }
    }

    fun matchingTargetCount(screenX: Float, screenY: Float, aspectRatio: Float): Int {
        validateInput(screenX, screenY, aspectRatio)
        return candidates(screenX, screenY, aspectRatio).size
    }

    private fun snareRadialDistance(hit: InstrumentHit): Float {
        val x = (hit.normalizedX - 0.5f) / 0.5f
        val y = (hit.normalizedY - 0.5f) / 0.5f
        return kotlin.math.sqrt(x * x + y * y)
    }

    private fun validateInput(screenX: Float, screenY: Float, aspectRatio: Float) {
        require(screenX.isFinite() && screenY.isFinite()) { "screen point must be finite" }
        require(aspectRatio.isFinite() && aspectRatio > 0f) {
            "aspect ratio must be positive and finite"
        }
    }
}
