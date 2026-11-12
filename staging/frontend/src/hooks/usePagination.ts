import { useState, useMemo, useCallback } from 'react'

const DEFAULT_PAGE_SIZE = 10

export function usePagination<T>(items: T[], pageSize: number = DEFAULT_PAGE_SIZE) {
  const [currentPage, setCurrentPage] = useState(1)

  const totalPages = Math.ceil(items.length / pageSize)

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [items, currentPage, pageSize])

  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages || 1)))
  }, [totalPages])

  const nextPage = useCallback(() => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages))
  }, [totalPages])

  const prevPage = useCallback(() => {
    setCurrentPage((prev) => Math.max(prev - 1, 1))
  }, [])

  const resetPage = useCallback(() => setCurrentPage(1), [])

  return {
    currentPage,
    totalPages,
    pageSize,
    paginatedItems,
    totalItems: items.length,
    goToPage,
    nextPage,
    prevPage,
    resetPage,
    hasNext: currentPage < totalPages,
    hasPrev: currentPage > 1,
  }
}
