from pathlib import Path

script_path = Path(__file__).with_name("apply-drum-kit-bugfix-task1.py")
script = script_path.read_text()

start = script.index("old_velocity = dedent(")
end = script.index("if view.count(old_velocity)", start)
script = script[:start] + '''old_velocity = (
    "        val pressure = event.getPressure(pointerIndex).coerceAtLeast(0f)\\n"
    "        val contactSize = event.getSize(pointerIndex).coerceAtLeast(0f)\\n"
    "        val velocity = estimateVelocity(pressure, contactSize, event.eventTime)\\n"
    "        val eventTimeNanos = event.eventTime * NanosPerMillisecond\\n"
)
new_velocity = (
    "        val pressure = event.getPressure(pointerIndex).coerceAtLeast(0f)\\n"
    "        val contactSize = event.getSize(pointerIndex).coerceAtLeast(0f)\\n"
    "        val velocityEstimate = velocityEstimator.estimate(\\n"
    "            StrikeVelocityInput(\\n"
    "                pressure = pressure,\\n"
    "                contactSize = contactSize,\\n"
    "                x = x,\\n"
    "                y = y,\\n"
    "                eventTimeMillis = event.eventTime,\\n"
    "                history = List(event.historySize) { historyIndex ->\\n"
    "                    StrikeVelocityHistoricalSample(\\n"
    "                        pressure = event.getHistoricalPressure(pointerIndex, historyIndex),\\n"
    "                        contactSize = event.getHistoricalSize(pointerIndex, historyIndex),\\n"
    "                        x = event.getHistoricalX(pointerIndex, historyIndex),\\n"
    "                        y = event.getHistoricalY(pointerIndex, historyIndex),\\n"
    "                        eventTimeMillis = event.getHistoricalEventTime(historyIndex),\\n"
    "                    )\\n"
    "                },\\n"
    "            ),\\n"
    "        )\\n"
    "        val velocity = velocityEstimate.velocity\\n"
    "        val eventTimeNanos = event.eventTime * NanosPerMillisecond\\n"
)
''' + script[end:]

start = script.index("old_method = dedent(")
end = script.index("if view.count(old_method)", start)
script = script[:start] + '''old_method = (
    "    private fun estimateVelocity(pressure: Float, contactSize: Float, eventTime: Long): Float {\\n"
    "        val pressureVelocity = if (pressure > 0.02f && pressure != 0.5f) {\\n"
    "            0.24f + pressure.coerceIn(0f, 1.2f) * 0.72f\\n"
    "        } else {\\n"
    "            0.58f + ((eventTime % 23L).toFloat() / 100f)\\n"
    "        }\\n"
    "        return (pressureVelocity + contactSize.coerceIn(0f, 1f) * 0.12f).coerceIn(0.22f, 1f)\\n"
    "    }\\n"
    "\\n"
)
''' + script[end:]

script_path.write_text(script)
namespace = {"__file__": str(script_path), "__name__": "__main__"}
exec(compile(script, str(script_path), "exec"), namespace)
