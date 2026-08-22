export function DonutChart({
  segments, centerValue, centerLabel,
}: {
  segments: { value: number; color: string }[]
  centerValue: string
  centerLabel: string
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  let acc = 0
  const stops = segments.map((seg) => {
    const start = total > 0 ? (acc / total) * 100 : 0
    acc += seg.value
    const end = total > 0 ? (acc / total) * 100 : 0
    return `${seg.color} ${start}% ${end}%`
  })
  const gradient = stops.length > 0 && total > 0 ? `conic-gradient(${stops.join(', ')})` : '#F0F1EE'

  return (
    <div className="w-[118px] h-[118px] shrink-0 rounded-full flex items-center justify-center" style={{ background: gradient }}>
      <div className="w-[78px] h-[78px] rounded-full bg-card flex flex-col items-center justify-center leading-[1.1]">
        <span className="text-xl font-extrabold tracking-tight">{centerValue}</span>
        <span className="text-[10px] text-muted-foreground">{centerLabel}</span>
      </div>
    </div>
  )
}
