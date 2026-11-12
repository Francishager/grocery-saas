import React from 'react'

export const Table: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full border-collapse">
        {children}
      </table>
    </div>
  )
}

export const TableHeader: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => {
  return <thead className={`bg-gray-50 ${className}`}>{children}</thead>
}

export const TableBody: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => {
  return <tbody className={className}>{children}</tbody>
}

export const TableRow: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => {
  return (
    <tr className={`border-b border-gray-200 hover:bg-gray-50 transition-colors ${className}`}>
      {children}
    </tr>
  )
}

export const TableHead: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => {
  return (
    <th
      className={`text-left px-6 py-3 font-semibold text-gray-900 text-sm ${className}`}
    >
      {children}
    </th>
  )
}

export const TableCell: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = '',
}) => {
  return (
    <td className={`px-6 py-3 text-sm text-gray-700 ${className}`}>
      {children}
    </td>
  )
}
