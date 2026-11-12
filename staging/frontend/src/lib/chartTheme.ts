export const chartAxisTick = { fill: 'hsl(var(--muted-foreground))' }
export const chartAxisLine = { stroke: 'hsl(var(--border))' }
export const chartGrid = { stroke: 'hsl(var(--border))', strokeDasharray: '3 3' }
export const chartTooltip = {
  contentStyle: {
    borderRadius: 8,
    border: '1px solid hsl(var(--border))',
    backgroundColor: 'hsl(var(--popover))',
    color: 'hsl(var(--popover-foreground))',
    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.18)',
  },
  labelStyle: { color: 'hsl(var(--popover-foreground))', fontWeight: 600 },
  itemStyle: { color: 'hsl(var(--popover-foreground))' },
}
