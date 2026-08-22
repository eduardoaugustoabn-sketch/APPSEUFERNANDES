import { Card, CardContent } from '@/components/ui/card'

type ChipTone = 'primary' | 'amber' | 'indigo' | 'neutral'

const CHIP_CLASSES: Record<ChipTone, string> = {
  primary: 'text-emerald-dark bg-emerald-tint',
  amber: 'text-amber-text bg-amber-tint',
  indigo: 'text-indigo bg-indigo-tint',
  neutral: 'text-muted-foreground bg-muted',
}

export function KpiCard({
  label, value, chip, barPercent, barColor = 'bg-primary', caption,
}: {
  label: string
  value: string
  chip?: { text: string; tone: ChipTone }
  barPercent?: number
  barColor?: string
  caption?: string
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="font-mono text-[10px] tracking-[0.13em] uppercase text-muted-foreground">{label}</p>
        <div className="flex items-baseline flex-wrap gap-2 my-3">
          <span className="text-[28px] font-extrabold tracking-tight tabular-nums whitespace-nowrap">{value}</span>
          {chip && (
            <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${CHIP_CLASSES[chip.tone]}`}>{chip.text}</span>
          )}
        </div>
        {barPercent !== undefined && (
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(Math.max(barPercent, 0), 100)}%` }} />
          </div>
        )}
        {caption && <p className="text-[11.5px] text-muted-foreground mt-2">{caption}</p>}
      </CardContent>
    </Card>
  )
}
