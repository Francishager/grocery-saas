import React, { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

export interface FeatureEntitlementItem {
  name: string
  displayName?: string
  enabled: boolean
  source?: string
}

export interface FeatureEntitlementNode {
  item: FeatureEntitlementItem
  children: FeatureEntitlementNode[]
}

export function applyFeatureBranchSelection(
  allNames: string[],
  currentNames: Iterable<string>,
  targetNames: string[],
  enabled: boolean,
): Set<string> {
  const available = new Set(allNames)
  const selected = new Set(currentNames)

  for (const name of targetNames) {
    if (enabled) selected.add(name)
    else selected.delete(name)
  }

  if (enabled) {
    for (const name of targetNames) {
      const parts = name.split('.')
      for (let index = 1; index < parts.length; index++) {
        const ancestor = parts.slice(0, index).join('.')
        if (available.has(ancestor)) selected.add(ancestor)
      }
    }
  } else {
    for (const name of targetNames) {
      const parts = name.split('.')
      for (let index = parts.length - 1; index > 0; index--) {
        const ancestor = parts.slice(0, index).join('.')
        if (available.has(ancestor) && ![...selected].some(item => item !== ancestor && item.startsWith(`${ancestor}.`))) {
          selected.delete(ancestor)
        }
      }
    }
  }

  return selected
}

export function buildFeatureEntitlementTree(items: FeatureEntitlementItem[]): FeatureEntitlementNode[] {
  const byName = new Map(items.map(item => [item.name, { item, children: [] as FeatureEntitlementNode[] }]))
  const roots: FeatureEntitlementNode[] = []

  for (const item of [...items].sort((a, b) => a.name.localeCompare(b.name))) {
    const node = byName.get(item.name)!
    const parts = item.name.split('.')
    let parent: string | undefined
    for (let index = parts.length - 1; index > 0; index--) {
      const candidate = parts.slice(0, index).join('.')
      if (byName.has(candidate)) { parent = candidate; break }
    }
    if (parent) byName.get(parent)!.children.push(node)
    else roots.push(node)
  }

  return roots
}

interface FeatureEntitlementTreeProps {
  nodes: FeatureEntitlementNode[]
  onToggle: (names: string[], enabled: boolean) => void
  disabled?: boolean
  canToggle?: (item: FeatureEntitlementItem) => boolean
  getClassName?: (item: FeatureEntitlementItem) => string
  depth?: number
}

function descendantNames(node: FeatureEntitlementNode): string[] {
  return [node.item.name, ...node.children.flatMap(descendantNames)]
}

export const FeatureEntitlementTree: React.FC<FeatureEntitlementTreeProps> = ({
  nodes,
  onToggle,
  disabled = false,
  canToggle,
  getClassName,
  depth = 0,
}) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const itemsByName = new Map<string, FeatureEntitlementItem>()
  const collectItems = (items: FeatureEntitlementNode[]) => items.forEach(entry => {
    itemsByName.set(entry.item.name, entry.item)
    collectItems(entry.children)
  })
  collectItems(nodes)

  return (
    <div className="space-y-2">
      {nodes.map(node => {
        const hasChildren = node.children.length > 0
        const isExpanded = expanded[node.item.name] ?? true
        const names = descendantNames(node).filter(name => canToggle?.(itemsByName.get(name)!) !== false)
        const enabledCount = names.filter(name => itemsByName.get(name)?.enabled).length
        const itemDisabled = disabled || canToggle?.(node.item) === false

        return (
          <div key={node.item.name}>
            <div className={`flex min-h-10 items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${getClassName?.(node.item) || 'border-gray-200 bg-white'}`} style={{ marginLeft: depth * 12 }}>
              {hasChildren ? (
                <button
                  type="button"
                  aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.item.displayName || node.item.name}`}
                  title={`${isExpanded ? 'Collapse' : 'Expand'} ${node.item.displayName || node.item.name}`}
                  className="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100"
                  onClick={() => setExpanded(current => ({ ...current, [node.item.name]: !isExpanded }))}
                >
                  {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </button>
              ) : <span className="w-7 shrink-0" />}
              <input
                type="checkbox"
                checked={node.item.enabled}
                disabled={itemDisabled}
                aria-label={node.item.displayName || node.item.name}
                onChange={event => onToggle(names, event.target.checked)}
              />
              <span className="min-w-0 flex-1">{node.item.displayName || node.item.name}</span>
              {hasChildren && <span className="shrink-0 text-xs text-gray-500">{enabledCount}/{names.length}</span>}
              {node.item.source && <span className="shrink-0 text-xs text-gray-500">{node.item.source}</span>}
            </div>
            {hasChildren && isExpanded && (
              <div className="mt-1 space-y-1">
                <FeatureEntitlementTree
                  nodes={node.children}
                  onToggle={onToggle}
                  disabled={disabled}
                  canToggle={canToggle}
                  getClassName={getClassName}
                  depth={depth + 1}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
