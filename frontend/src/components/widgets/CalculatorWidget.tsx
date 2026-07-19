import { useState, useEffect, useCallback, useRef } from 'react'
import { History, X, Delete } from 'lucide-react'

interface HistoryEntry {
  expression: string
  result: string
  timestamp: number
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem('calc_history')
    if (raw) return JSON.parse(raw)
  } catch {}
  return []
}

function saveHistory(history: HistoryEntry[]) {
  try {
    localStorage.setItem('calc_history', JSON.stringify(history))
  } catch {}
}

export function CalculatorWidget() {
  const [display, setDisplay] = useState('0')
  const [expression, setExpression] = useState('')
  const [previousValue, setPreviousValue] = useState<number | null>(null)
  const [operator, setOperator] = useState<string | null>(null)
  const [waitingForOperand, setWaitingForOperand] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory)
  const [showHistory, setShowHistory] = useState(false)
  const [justCalculated, setJustCalculated] = useState(false)
  const inputRef = useRef<HTMLDivElement>(null)

  // Keep only last 2 history entries
  useEffect(() => {
    if (history.length > 2) {
      const trimmed = history.slice(0, 2)
      setHistory(trimmed)
      saveHistory(trimmed)
    } else {
      saveHistory(history)
    }
  }, [history])

  const calculate = useCallback((a: number, b: number, op: string): number => {
    switch (op) {
      case '+': return a + b
      case '-': return a - b
      case '×': return a * b
      case '÷': return b !== 0 ? a / b : NaN
      case '%': return a % b
      default: return b
    }
  }, [])

  const formatNumber = (n: number): string => {
    if (isNaN(n)) return 'Error'
    if (!isFinite(n)) return 'Error'
    const str = n.toString()
    if (str.length > 12) return n.toPrecision(10).replace(/\.?0+$/, '')
    return str
  }

  const inputDigit = (digit: string) => {
    if (justCalculated) {
      setDisplay(digit)
      setExpression(digit)
      setJustCalculated(false)
      setWaitingForOperand(false)
      return
    }
    if (waitingForOperand) {
      setDisplay(digit)
      setWaitingForOperand(false)
    } else {
      setDisplay(display === '0' ? digit : display + digit)
    }
    setExpression((prev) => (waitingForOperand || justCalculated ? digit : (prev === '0' || prev === '' ? digit : prev + digit)))
  }

  const inputDecimal = () => {
    if (justCalculated) {
      setDisplay('0.')
      setExpression('0.')
      setJustCalculated(false)
      setWaitingForOperand(false)
      return
    }
    if (waitingForOperand) {
      setDisplay('0.')
      setWaitingForOperand(false)
      return
    }
    if (!display.includes('.')) {
      setDisplay(display + '.')
      setExpression((prev) => prev + '.')
    }
  }

  const clear = () => {
    setDisplay('0')
    setExpression('')
    setPreviousValue(null)
    setOperator(null)
    setWaitingForOperand(false)
    setJustCalculated(false)
  }

  const toggleSign = () => {
    const val = parseFloat(display)
    if (val === 0) return
    const newVal = -val
    setDisplay(formatNumber(newVal))
    setExpression(formatNumber(newVal))
  }

  const inputPercent = () => {
    const val = parseFloat(display)
    const pct = val / 100
    setDisplay(formatNumber(pct))
    setExpression(formatNumber(pct))
  }

  const performOperation = (nextOperator: string) => {
    const inputValue = parseFloat(display)

    if (previousValue === null) {
      setPreviousValue(inputValue)
    } else if (operator) {
      const result = calculate(previousValue, inputValue, operator)
      setDisplay(formatNumber(result))
      setPreviousValue(result)
    }

    if (nextOperator !== '=') {
      setExpression((prev) => prev + ` ${nextOperator} `)
      setOperator(nextOperator)
      setWaitingForOperand(true)
      setJustCalculated(false)
    } else {
      // Calculate final result
      if (operator && previousValue !== null) {
        const result = calculate(previousValue, inputValue, operator)
        const exprStr = `${formatNumber(previousValue)} ${operator} ${formatNumber(inputValue)}`
        const resultStr = formatNumber(result)
        setDisplay(resultStr)
        setExpression(resultStr)
        setPreviousValue(null)
        setOperator(null)
        setWaitingForOperand(false)
        setJustCalculated(true)

        // Add to history (keep last 2)
        if (resultStr !== 'Error') {
          setHistory((prev) => [{ expression: exprStr, result: resultStr, timestamp: Date.now() }, ...prev].slice(0, 2))
        }
      }
    }
  }

  // Keyboard support
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Only handle if calculator area is focused or hovered
      if (!inputRef.current?.closest(':hover') && document.activeElement?.tagName !== 'BODY') return
      const key = e.key
      if (key >= '0' && key <= '9') { inputDigit(key); e.preventDefault() }
      else if (key === '.') { inputDecimal(); e.preventDefault() }
      else if (key === '+') { performOperation('+'); e.preventDefault() }
      else if (key === '-') { performOperation('-'); e.preventDefault() }
      else if (key === '*') { performOperation('×'); e.preventDefault() }
      else if (key === '/') { performOperation('÷'); e.preventDefault() }
      else if (key === 'Enter' || key === '=') { performOperation('='); e.preventDefault() }
      else if (key === 'Escape' || key === 'c' || key === 'C') { clear(); e.preventDefault() }
      else if (key === 'Backspace') {
        if (display.length > 1) {
          setDisplay(display.slice(0, -1))
          setExpression(expression.slice(0, -1))
        } else {
          setDisplay('0')
          setExpression('')
        }
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })

  const useHistoryResult = (result: string) => {
    setDisplay(result)
    setExpression(result)
    setJustCalculated(true)
    setShowHistory(false)
  }

  const clearHistory = () => {
    setHistory([])
    saveHistory([])
  }

  const btnBase = "flex items-center justify-center text-lg font-medium rounded-lg transition-all active:scale-95 select-none cursor-pointer"
  const btnNum = `${btnBase} bg-gray-50 hover:bg-gray-100 text-gray-900`
  const btnOp = `${btnBase} bg-amber-50 hover:bg-amber-100 text-amber-700`
  const btnFn = `${btnBase} bg-gray-100 hover:bg-gray-200 text-gray-600`
  const btnEq = `${btnBase} bg-amber-500 hover:bg-amber-600 text-white`

  return (
    <div ref={inputRef} className="flex flex-col h-full bg-white p-3 gap-2" tabIndex={0}>
      {/* Display */}
      <div className="flex flex-col items-end justify-end p-3 bg-gray-50 rounded-lg min-h-[72px]">
        {showHistory ? (
          <div className="w-full">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 flex items-center gap-1">
                <History className="h-3.5 w-3.5" /> History
              </span>
              <div className="flex gap-1">
                {history.length > 0 && (
                  <button onClick={clearHistory} className="p-1 text-gray-400 hover:text-red-500 rounded">
                    <Delete className="h-3.5 w-3.5" />
                  </button>
                )}
                <button onClick={() => setShowHistory(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {history.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No history yet</p>
            ) : (
              <div className="space-y-2">
                {history.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => useHistoryResult(h.result)}
                    className="w-full text-right p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <p className="text-xs text-gray-500">{h.expression} =</p>
                    <p className="text-lg font-semibold text-gray-900">{h.result}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="text-xs text-gray-400 w-full text-right truncate" style={{ minHeight: '16px' }}>
              {expression || '\u00A0'}
            </div>
            <div className="text-3xl font-bold text-gray-900 w-full text-right truncate">
              {display}
            </div>
          </>
        )}
      </div>

      {/* History toggle button */}
      <button
        onClick={() => setShowHistory(!showHistory)}
        className={`flex items-center justify-center gap-1 text-xs py-1 rounded-md transition-colors ${showHistory ? 'bg-amber-100 text-amber-700' : 'bg-gray-50 hover:bg-gray-100 text-gray-500'}`}
      >
        <History className="h-3.5 w-3.5" />
        {history.length > 0 ? `History (${history.length})` : 'History'}
      </button>

      {/* Buttons grid */}
      {!showHistory && (
        <div className="grid grid-cols-4 gap-1.5 flex-1">
          <button className={btnFn} onClick={clear}>C</button>
          <button className={btnFn} onClick={toggleSign}>±</button>
          <button className={btnFn} onClick={inputPercent}>%</button>
          <button className={btnOp} onClick={() => performOperation('÷')}>÷</button>

          <button className={btnNum} onClick={() => inputDigit('7')}>7</button>
          <button className={btnNum} onClick={() => inputDigit('8')}>8</button>
          <button className={btnNum} onClick={() => inputDigit('9')}>9</button>
          <button className={btnOp} onClick={() => performOperation('×')}>×</button>

          <button className={btnNum} onClick={() => inputDigit('4')}>4</button>
          <button className={btnNum} onClick={() => inputDigit('5')}>5</button>
          <button className={btnNum} onClick={() => inputDigit('6')}>6</button>
          <button className={btnOp} onClick={() => performOperation('-')}>−</button>

          <button className={btnNum} onClick={() => inputDigit('1')}>1</button>
          <button className={btnNum} onClick={() => inputDigit('2')}>2</button>
          <button className={btnNum} onClick={() => inputDigit('3')}>3</button>
          <button className={btnOp} onClick={() => performOperation('+')}>+</button>

          <button className={`${btnNum} col-span-2`} onClick={() => inputDigit('0')}>0</button>
          <button className={btnNum} onClick={inputDecimal}>.</button>
          <button className={btnEq} onClick={() => performOperation('=')}>=</button>
        </div>
      )}
    </div>
  )
}
