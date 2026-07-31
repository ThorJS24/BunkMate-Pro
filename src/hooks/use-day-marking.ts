import { useAttendanceStore } from '@/store/attendance-store'
import { useTimetableStore } from '@/store/timetable-store'
import { useToastStore } from '@/store/toast-store'

/**
 * Shared attendance-marking logic for a single day, used by both the Calendar
 * day panel and the Today view so the create-or-update-and-undo behaviour
 * lives in exactly one place.
 *
 * writeAttendance reuses an existing record for that subject/date/period or
 * creates one, and returns an undo closure that restores the exact prior
 * state (old status, or delete if the write created the record). toggle wraps
 * it with the standard toast + Undo action.
 */
export function useDayMarking() {
  const records = useAttendanceStore((s) => s.records)
  const createRecord = useAttendanceStore((s) => s.create)
  const updateRecord = useAttendanceStore((s) => s.update)
  const removeRecord = useAttendanceStore((s) => s.remove)
  const slots = useTimetableStore((s) => s.slots)
  const pushToast = useToastStore((s) => s.push)

  async function writeAttendance(
    dateIso: string,
    subjectId: number,
    slotId: number,
    status: 'present' | 'absent',
  ): Promise<() => Promise<void>> {
    const slot = slots.find((s) => s.id === slotId)
    if (!slot) return async () => {}
    const existing = records.find(
      (r) => r.subjectId === subjectId && r.date === dateIso && r.period === slot.period,
    )
    if (existing) {
      const priorStatus = existing.status
      await updateRecord(existing.id, { status })
      return async () => {
        await updateRecord(existing.id, { status: priorStatus })
      }
    }
    const created = await createRecord({
      subjectId,
      date: dateIso,
      period: slot.period,
      status,
      source: 'manual',
      slotId,
    })
    return async () => {
      await removeRecord(created.id)
    }
  }

  async function toggle(dateIso: string, subjectId: number, slotId: number, status: 'present' | 'absent') {
    const undo = await writeAttendance(dateIso, subjectId, slotId, status)
    pushToast({
      title: `Marked ${status}`,
      action: {
        label: 'Undo',
        onClick: () => {
          void undo()
        },
      },
    })
  }

  return { writeAttendance, toggle }
}
