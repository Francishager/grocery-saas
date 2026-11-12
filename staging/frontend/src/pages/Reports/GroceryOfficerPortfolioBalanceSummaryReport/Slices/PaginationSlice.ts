import { createSlice, PayloadAction } from '@reduxjs/toolkit'

export interface PaginationState {
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  hasNextPage: boolean
  hasPrevPage: boolean
}

const initialState: PaginationState = {
  page: 1,
  pageSize: 10,
  totalItems: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPrevPage: false,
}

const groceryOfficerPortfolioBalanceSummaryReportPaginationSlice = createSlice({
  name: 'groceryOfficerPortfolioBalanceSummaryReportPagination',
  initialState,
  reducers: {
    setPage: (state, action: PayloadAction<number>) => {
      state.page = action.payload
    },
    setPageSize: (state, action: PayloadAction<number>) => {
      state.pageSize = action.payload
      state.page = 1
    },
    setTotalItems: (state, action: PayloadAction<number>) => {
      state.totalItems = action.payload
      state.totalPages = Math.ceil(action.payload / state.pageSize)
      state.hasNextPage = state.page < state.totalPages
      state.hasPrevPage = state.page > 1
    },
    setPagination: (state, action: PayloadAction<Partial<PaginationState>>) => {
      const { page, pageSize, totalItems } = action.payload
      
      if (pageSize !== undefined) {
        state.pageSize = pageSize
      }
      if (page !== undefined) {
        state.page = page
      }
      if (totalItems !== undefined) {
        state.totalItems = totalItems
        state.totalPages = Math.ceil(totalItems / state.pageSize)
      }
      
      state.hasNextPage = state.page < state.totalPages
      state.hasPrevPage = state.page > 1
    },
    nextPage: (state) => {
      if (state.hasNextPage) {
        state.page += 1
        state.hasPrevPage = true
        state.hasNextPage = state.page < state.totalPages
      }
    },
    prevPage: (state) => {
      if (state.hasPrevPage) {
        state.page -= 1
        state.hasNextPage = true
        state.hasPrevPage = state.page > 1
      }
    },
    firstPage: (state) => {
      state.page = 1
      state.hasPrevPage = false
      state.hasNextPage = state.totalPages > 1
    },
    lastPage: (state) => {
      state.page = state.totalPages
      state.hasNextPage = false
      state.hasPrevPage = state.totalPages > 1
    },
    reset: () => initialState,
  },
})

export const {
  setPage,
  setPageSize,
  setTotalItems,
  setPagination,
  nextPage,
  prevPage,
  firstPage,
  lastPage,
  reset,
} = groceryOfficerPortfolioBalanceSummaryReportPaginationSlice.actions

export default groceryOfficerPortfolioBalanceSummaryReportPaginationSlice.reducer
