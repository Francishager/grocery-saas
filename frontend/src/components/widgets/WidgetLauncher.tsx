import { useState } from 'react'
import { StickyNote as StickyNoteIcon, Calculator as CalcIcon } from 'lucide-react'
import { FloatingWidget } from './FloatingWidget'
import { StickyNoteWidget } from './StickyNoteWidget'
import { CalculatorWidget } from './CalculatorWidget'

export function WidgetLauncher() {
  const [showSticky, setShowSticky] = useState(false)
  const [showCalc, setShowCalc] = useState(false)

  return (
    <>
      {/* Launcher icons */}
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => setShowSticky(!showSticky)}
          className={`relative p-2 rounded-lg transition-colors ${showSticky ? 'text-amber-600 bg-amber-50' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
          title="Sticky Notes"
        >
          <StickyNoteIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => setShowCalc(!showCalc)}
          className={`relative p-2 rounded-lg transition-colors ${showCalc ? 'text-blue-600 bg-blue-50' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
          title="Calculator"
        >
          <CalcIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Floating widgets */}
      {showSticky && (
        <FloatingWidget
          id="sticky-note"
          title="Sticky Notes"
          icon={<StickyNoteIcon className="h-4 w-4" />}
          onClose={() => setShowSticky(false)}
          defaultWidth={300}
          defaultHeight={380}
          minWidth={240}
          minHeight={200}
          accentColor="#f59e0b"
        >
          <StickyNoteWidget />
        </FloatingWidget>
      )}

      {showCalc && (
        <FloatingWidget
          id="calculator"
          title="Calculator"
          icon={<CalcIcon className="h-4 w-4" />}
          onClose={() => setShowCalc(false)}
          defaultWidth={260}
          defaultHeight={400}
          minWidth={220}
          minHeight={320}
          accentColor="#3b82f6"
        >
          <CalculatorWidget />
        </FloatingWidget>
      )}
    </>
  )
}
