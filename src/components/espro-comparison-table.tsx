import { Badge } from '@/components/ui/badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import type { AttendanceComparisonRow } from '../../electron/espro/attendance-totals'

/**
 * Shared table for the ESPRO official-totals-vs-BunkMate comparison, used on
 * both the Dashboard and in Settings. Deliberately compact — just the
 * percentage in each cell, with the attended/total fraction moved into a
 * tooltip — so this fits inside a narrow Dashboard tile without ever needing
 * horizontal scroll (the base Table component wraps in overflow-x-auto,
 * which only shows a scrollbar once content actually overflows).
 */
export function EsproComparisonTable({ rows }: { rows: AttendanceComparisonRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Subject</TableHead>
          <TableHead>ESPRO</TableHead>
          <TableHead>BunkMate</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
              No subjects to compare.
            </TableCell>
          </TableRow>
        )}
        {rows.map((row) => (
          <TableRow key={row.subjectName}>
            <TableCell className="max-w-32 truncate whitespace-normal text-xs font-medium">
              {row.subjectName}
            </TableCell>
            <TableCell className="text-xs" title={row.espro ? `${row.espro.attended}/${row.espro.total} periods` : undefined}>
              {row.espro ? `${row.espro.percentage.toFixed(1)}%` : '—'}
            </TableCell>
            <TableCell
              className="text-xs"
              title={row.local ? `${row.local.attended}/${row.local.total} periods` : undefined}
            >
              {row.local ? (row.local.percentage === null ? '—' : `${row.local.percentage.toFixed(1)}%`) : '—'}
            </TableCell>
            <TableCell className="px-1.5">
              {row.status === 'match' && <Badge variant="success">Match</Badge>}
              {row.status === 'mismatch' && <Badge variant="warning">Off</Badge>}
              {row.status === 'espro-only' && <Badge variant="outline">ESPRO only</Badge>}
              {row.status === 'local-only' && <Badge variant="outline">Local only</Badge>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
