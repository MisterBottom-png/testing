package com.vitautas.drumkit.model

enum class InstrumentId(val nativeCode: Int, val label: String) {
    KICK(0, "Kick"),
    SNARE(1, "Snare"),
    TOM_HIGH(2, "High Tom"),
    TOM_MID(3, "Mid Tom"),
    FLOOR_TOM(4, "Floor Tom"),
    HI_HAT(5, "Hi-Hat"),
    CRASH(6, "Crash"),
    RIDE(7, "Ride"),
}

enum class InstrumentShape {
    DRUM,
    CYMBAL,
    KICK,
}

data class NormalizedRect(
    val left: Float,
    val top: Float,
    val right: Float,
    val bottom: Float,
) {
    init {
        require(left in 0f..1f && right in 0f..1f)
        require(top in 0f..1f && bottom in 0f..1f)
        require(left < right && top < bottom)
    }
}

data class InstrumentDefinition(
    val id: InstrumentId,
    val bounds: NormalizedRect,
    val shape: InstrumentShape,
    val pan: Float,
)

object StudioKitDefinition {
    val instruments: List<InstrumentDefinition> = listOf(
        InstrumentDefinition(InstrumentId.CRASH, NormalizedRect(0.04f, 0.04f, 0.29f, 0.29f), InstrumentShape.CYMBAL, -0.55f),
        InstrumentDefinition(InstrumentId.RIDE, NormalizedRect(0.71f, 0.05f, 0.96f, 0.30f), InstrumentShape.CYMBAL, 0.55f),
        InstrumentDefinition(InstrumentId.HI_HAT, NormalizedRect(0.02f, 0.32f, 0.25f, 0.56f), InstrumentShape.CYMBAL, -0.65f),
        InstrumentDefinition(InstrumentId.TOM_HIGH, NormalizedRect(0.27f, 0.20f, 0.48f, 0.48f), InstrumentShape.DRUM, -0.22f),
        InstrumentDefinition(InstrumentId.TOM_MID, NormalizedRect(0.49f, 0.19f, 0.71f, 0.48f), InstrumentShape.DRUM, 0.14f),
        InstrumentDefinition(InstrumentId.SNARE, NormalizedRect(0.20f, 0.49f, 0.47f, 0.80f), InstrumentShape.DRUM, -0.18f),
        InstrumentDefinition(InstrumentId.FLOOR_TOM, NormalizedRect(0.71f, 0.48f, 0.96f, 0.82f), InstrumentShape.DRUM, 0.46f),
        InstrumentDefinition(InstrumentId.KICK, NormalizedRect(0.40f, 0.46f, 0.70f, 0.92f), InstrumentShape.KICK, 0.0f),
    )
}

data class DrumStrike(
    val pointerId: Int,
    val instrument: InstrumentId,
    val velocity: Float,
    val normalizedX: Float,
    val normalizedY: Float,
    val pressure: Float,
    val contactSize: Float,
    val eventTimeNanos: Long,
    val snareArticulation: SnareArticulation = SnareArticulation.CENTER,
)

data class AudioDiagnostics(
    val running: Boolean = false,
    val sampleRate: Int = 0,
    val framesPerBurst: Int = 0,
    val underruns: Int = 0,
)
