package com.vitautas.drumkit.audio

import com.vitautas.drumkit.model.DrumStrike
import com.vitautas.drumkit.model.InstrumentId
import com.vitautas.drumkit.model.SnareArticulation
import com.vitautas.drumkit.model.SnareArticulationResolver
import kotlin.math.floor

/**
 * Request-side diagnostic trace captured before JNI dispatch.
 *
 * Values that can only be known inside the native callback remain null and are
 * deliberately labelled as unobserved rather than predicted.
 */
data class AudioDispatchDecision(
    val instrument: InstrumentId,
    val sanitizedVelocity: Float,
    val sanitizedNormalizedX: Float,
    val sanitizedNormalizedY: Float,
    val velocityEstimatorInputMode: String,
    val articulation: SnareArticulation?,
    val lowerVelocityLayer: Int?,
    val upperVelocityLayer: Int?,
    val velocityLayerBlend: Float?,
    val lowerRoundRobinIndex: Int?,
    val upperRoundRobinIndex: Int?,
    val pitchVariation: Float?,
    val gainVariation: Float?,
    val filterVariation: Float?,
    val stereoPan: Float,
    val nativeQueueState: String,
    val activeVoiceCount: Int?,
    val voiceStealOccurred: Boolean?,
    val nativeSelectionTraceAvailable: Boolean,
)

object AudioDispatchDecisionFactory {
    private const val SnareLayerCount = 6

    fun create(strike: DrumStrike): AudioDispatchDecision {
        val velocity = AudioInputSanitizer.velocity(strike.velocity)
        val normalizedX = AudioInputSanitizer.coordinate(strike.normalizedX)
        val normalizedY = AudioInputSanitizer.coordinate(strike.normalizedY)
        val articulation = if (strike.instrument == InstrumentId.SNARE) {
            SnareArticulationResolver.resolve(
                normalizedX = normalizedX,
                normalizedY = normalizedY,
                velocity = velocity,
            )
        } else {
            null
        }
        val layerPosition = if (articulation != null) velocity * (SnareLayerCount - 1) else null
        val lowerLayer = layerPosition?.let { floor(it).toInt().coerceIn(0, SnareLayerCount - 1) }
        val upperLayer = lowerLayer?.let { (it + 1).coerceAtMost(SnareLayerCount - 1) }
        val blend = if (layerPosition != null && lowerLayer != null) {
            (layerPosition - lowerLayer).coerceIn(0f, 1f)
        } else {
            null
        }

        return AudioDispatchDecision(
            instrument = strike.instrument,
            sanitizedVelocity = velocity,
            sanitizedNormalizedX = normalizedX,
            sanitizedNormalizedY = normalizedY,
            velocityEstimatorInputMode = velocityEstimatorInputMode(strike),
            articulation = articulation,
            lowerVelocityLayer = lowerLayer,
            upperVelocityLayer = upperLayer,
            velocityLayerBlend = blend,
            lowerRoundRobinIndex = null,
            upperRoundRobinIndex = null,
            pitchVariation = null,
            gainVariation = null,
            filterVariation = null,
            stereoPan = actualNativePan(strike.instrument),
            nativeQueueState = "native_trigger_invoked_unobserved",
            activeVoiceCount = null,
            voiceStealOccurred = null,
            nativeSelectionTraceAvailable = false,
        )
    }

    private fun velocityEstimatorInputMode(strike: DrumStrike): String =
        if (strike.pressure > 0.02f && strike.pressure != 0.5f) {
            "pressure_plus_contact_size"
        } else {
            "timestamp_fallback_plus_contact_size"
        }

    private fun actualNativePan(instrument: InstrumentId): Float = when (instrument) {
        InstrumentId.KICK -> 0.0f
        InstrumentId.SNARE -> -0.12f
        InstrumentId.TOM_HIGH -> -0.22f
        InstrumentId.TOM_MID -> 0.14f
        InstrumentId.FLOOR_TOM -> 0.46f
        InstrumentId.HI_HAT -> -0.62f
        InstrumentId.CRASH -> -0.52f
        InstrumentId.RIDE -> 0.52f
    }
}
