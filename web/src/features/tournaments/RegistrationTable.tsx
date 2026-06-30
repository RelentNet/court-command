import { useState, useMemo, useEffect } from 'react'
import { useListRegistrations, type Division, type Registration } from './hooks'
import { useDebounce } from '../../hooks/useDebounce'
import { Table } from '../../components/Table'
import { SearchInput } from '../../components/SearchInput'
import { Select } from '../../components/Select'
import { StatusBadge } from '../../components/StatusBadge'
import { EmptyState } from '../../components/EmptyState'
import { SkeletonTable } from '../../components/Skeleton'
import { formatDate } from '../../lib/formatters'
import { Users } from 'lucide-react'

interface RegistrationTableProps {
  tournamentId: string
  divisions: Division[]
}

interface RegistrationRow extends Registration {
  divisionName: string
}

function RegistrationsForDivision({
  division,
  onData,
}: {
  division: Division
  onData: (divisionId: number, rows: Registration[]) => void
}) {
  const { data } = useListRegistrations(String(division.id), undefined, 200)

  // Push data up to parent when it changes
  useEffect(() => {
    if (data?.items) {
      onData(division.id, data.items)
    }
  }, [data?.items, division.id, onData])

  return null
}

export function RegistrationTable({
  tournamentId: _tournamentId,
  divisions,
}: RegistrationTableProps) {
  const [search, setSearch] = useState('')
  const [divisionFilter, setDivisionFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const debouncedSearch = useDebounce(search)

  // Collect registrations from all divisions
  const [regMap, setRegMap] = useState<Record<number, Registration[]>>({})

  const handleData = useMemo(
    () => (divisionId: number, rows: Registration[]) => {
      setRegMap((prev) => {
        if (prev[divisionId] === rows) return prev
        return { ...prev, [divisionId]: rows }
      })
    },
    [],
  )

  const divisionMap = useMemo(() => {
    const map: Record<number, string> = {}
    for (const d of divisions) {
      map[d.id] = d.name
    }
    return map
  }, [divisions])

  const allRows: RegistrationRow[] = useMemo(() => {
    const rows: RegistrationRow[] = []
    for (const [divId, regs] of Object.entries(regMap)) {
      const divName = divisionMap[Number(divId)] ?? `Division #${divId}`
      for (const r of regs) {
        rows.push({ ...r, divisionName: divName })
      }
    }
    return rows
  }, [regMap, divisionMap])

  const filteredRows = useMemo(() => {
    let rows = allRows

    if (divisionFilter) {
      rows = rows.filter((r) => String(r.division_id) === divisionFilter)
    }
    if (statusFilter) {
      rows = rows.filter((r) => r.status === statusFilter)
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      rows = rows.filter(
        (r) =>
          r.divisionName.toLowerCase().includes(q) ||
          String(r.id).includes(q) ||
          (r.registration_notes ?? '').toLowerCase().includes(q),
      )
    }
    return rows
  }, [allRows, divisionFilter, statusFilter, debouncedSearch])

  const isLoading = divisions.length > 0 && Object.keys(regMap).length === 0

  const columns = [
    {
      key: 'id',
      header: 'Reg #',
      render: (r: RegistrationRow) => (
        <span className="font-mono text-(--color-text-secondary)">#{r.id}</span>
      ),
    },
    {
      key: 'division',
      header: 'Division',
      render: (r: RegistrationRow) => (
        <span className="text-(--color-text-primary)">{r.divisionName}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r: RegistrationRow) => (
        <StatusBadge status={r.status} type="registration" />
      ),
    },
    {
      key: 'seed',
      header: 'Seed',
      render: (r: RegistrationRow) => (
        <span className="text-(--color-text-secondary)">
          {r.seed ?? '\u2014'}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Registered',
      render: (r: RegistrationRow) => (
        <span className="text-(--color-text-secondary)">
          {formatDate(r.registered_at)}
        </span>
      ),
      className: 'hidden md:table-cell',
    },
  ]

  return (
    <div>
      {/* Invisible fetchers for each division */}
      {divisions.map((d) => (
        <RegistrationsForDivision
          key={d.id}
          division={d}
          onData={handleData}
        />
      ))}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search registrations..."
          className="max-w-md flex-1"
        />
        <Select
          value={divisionFilter}
          onChange={(e) => setDivisionFilter(e.target.value)}
          className="w-48"
        >
          <option value="">All Divisions</option>
          {divisions.map((d) => (
            <option key={d.id} value={String(d.id)}>
              {d.name}
            </option>
          ))}
        </Select>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-40"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="waitlisted">Waitlisted</option>
          <option value="rejected">Rejected</option>
          <option value="withdrawn">Withdrawn</option>
          <option value="checked_in">Checked In</option>
          <option value="no_show">No Show</option>
        </Select>
      </div>

      {isLoading ? (
        <SkeletonTable rows={6} />
      ) : filteredRows.length === 0 ? (
        <EmptyState
          icon={<Users className="h-12 w-12" />}
          title="No registrations found"
          description={
            search || divisionFilter || statusFilter
              ? 'No registrations match your filters.'
              : 'No registrations have been submitted yet.'
          }
        />
      ) : (
        <div className="rounded-xl border border-(--color-border) bg-(--color-bg-secondary) overflow-hidden">
          <Table
            columns={columns}
            data={filteredRows}
            keyExtractor={(r) => `${r.division_id}-${r.id}`}
          />
        </div>
      )}

      <p className="text-xs text-(--color-text-secondary) mt-2">
        Total: {filteredRows.length} registration{filteredRows.length !== 1 ? 's' : ''}
        {allRows.length !== filteredRows.length &&
          ` (${allRows.length} total)`}
      </p>
    </div>
  )
}
