package com.vitautas.drumkit.audio

const val NATIVE_DISPATCH_OUTCOME_INT_FIELD_COUNT = 5
const val NATIVE_DISPATCH_OUTCOME_FLOAT_FIELD_COUNT = 3

data class NativeDispatchOutcome(
    val diagnosticToken: Long,
    val lowerRoundRobinIndex: Int?,
    val upperRoundRobinIndex: Int?,
    val pitchVariation: Float?,
    val gainVariation: Float?,
    val filterVariation: Float?,
    val activeVoiceCount: Int,
    val voiceStealOccurred: Boolean,
    val sampledVoice: Boolean,
)

data class NativeDispatchOutcomeBatch(
    val outcomes: List<NativeDispatchOutcome>,
    val droppedOutcomeCount: Int,
)

internal object NativeDispatchOutcomeDecoder {
    fun appendDecoded(
        tokens: LongArray,
        integers: IntArray,
        floats: FloatArray,
        count: Int,
        destination: MutableList<NativeDispatchOutcome>,
    ) {
        require(count >= 0) { "count must not be negative" }
        require(count <= tokens.size) { "token buffer is too small" }
        require(count * NATIVE_DISPATCH_OUTCOME_INT_FIELD_COUNT <= integers.size) {
            "integer buffer is too small"
        }
        require(count * NATIVE_DISPATCH_OUTCOME_FLOAT_FIELD_COUNT <= floats.size) {
            "float buffer is too small"
        }

        repeat(count) { index ->
            val integerOffset = index * NATIVE_DISPATCH_OUTCOME_INT_FIELD_COUNT
            val floatOffset = index * NATIVE_DISPATCH_OUTCOME_FLOAT_FIELD_COUNT
            val sampled = integers[integerOffset + 4] != 0
            destination += NativeDispatchOutcome(
                diagnosticToken = tokens[index],
                lowerRoundRobinIndex = integers[integerOffset].nullableIndex(sampled),
                upperRoundRobinIndex = integers[integerOffset + 1].nullableIndex(sampled),
                pitchVariation = floats[floatOffset].nullableVariation(sampled),
                gainVariation = floats[floatOffset + 1].nullableVariation(sampled),
                filterVariation = floats[floatOffset + 2].nullableVariation(sampled),
                activeVoiceCount = integers[integerOffset + 2].coerceAtLeast(0),
                voiceStealOccurred = integers[integerOffset + 3] != 0,
                sampledVoice = sampled,
            )
        }
    }

    private fun Int.nullableIndex(sampled: Boolean): Int? =
        if (sampled && this >= 0) this else null

    private fun Float.nullableVariation(sampled: Boolean): Float? =
        if (sampled && isFinite()) this else null
}
