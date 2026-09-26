'use client';

import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';
import { Button, Field, Select, TextInput } from '@/components/ui';
import { AVAILABILITY_STATUSES, sortSlots, type AvailabilityValue } from '@/lib/availability';
import { formatDateForLocale, interpolate } from '@/lib/i18n/format';
import type { AvailabilityStatus } from '@/lib/database.types';

function newId() {
  return `draft-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Flexible skipper availability: immediately, for the season, from a date, one or more
 * periods (from… to…), specific days, or not available. Periods/days can be edited and removed.
 */
export default function AvailabilityEditor({
  value,
  onChange,
  showSeason = true,
}: {
  value: AvailabilityValue;
  onChange: (value: AvailabilityValue) => void;
  showSeason?: boolean;
}) {
  const { copy, locale } = useLocale();
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const isSpecific = value.status === 'specific';
  const statuses = AVAILABILITY_STATUSES.filter((status) => showSeason || status !== 'season');

  function resetDraft() {
    setDraftStart('');
    setDraftEnd('');
    setEditingId(null);
    setError('');
  }

  function changeStatus(status: AvailabilityStatus) {
    resetDraft();
    // Periods and specific days are different things: switching clears the list.
    const keepSlots = (status === 'range' && value.status === 'range') || (status === 'specific' && value.status === 'specific');
    onChange({ ...value, status, slots: keepSlots ? value.slots : [] });
  }

  function saveSlot() {
    const start = draftStart;
    const end = isSpecific ? draftStart : draftEnd;
    if (!start || !end) {
      setError(isSpecific ? copy.availability.errors.dateRequired : copy.availability.errors.startEndRequired);
      return;
    }
    if (end < start) {
      setError(copy.availability.errors.endAfterStart);
      return;
    }
    const slots = editingId
      ? value.slots.map((slot) => (slot.id === editingId ? { ...slot, start_date: start, end_date: end } : slot))
      : value.slots.some((slot) => slot.start_date === start && slot.end_date === end)
        ? value.slots
        : [...value.slots, { id: newId(), start_date: start, end_date: end }];
    onChange({ ...value, slots: sortSlots(slots) });
    resetDraft();
  }

  function editSlot(id: string) {
    const slot = value.slots.find((entry) => entry.id === id);
    if (!slot) return;
    setEditingId(id);
    setDraftStart(slot.start_date);
    setDraftEnd(slot.end_date);
    setError('');
  }

  function removeSlot(id: string) {
    onChange({ ...value, slots: value.slots.filter((slot) => slot.id !== id) });
    if (editingId === id) resetDraft();
  }

  const format = (date: string) => formatDateForLocale(date, locale, { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="space-y-3 rounded-2xl border border-navy/[0.08] bg-offwhite p-3 sm:p-4">
      <Select aria-label={copy.availability.label} value={value.status} onChange={(event) => changeStatus(event.target.value as AvailabilityStatus)}>
        {statuses.map((status) => (
          <option key={status} value={status}>
            {copy.availability.statuses[status]}
          </option>
        ))}
      </Select>

      {value.status === 'from_date' && (
        <TextInput type="date" aria-label={copy.availability.statuses.from_date} value={value.fromDate} onChange={(event) => onChange({ ...value, fromDate: event.target.value })} />
      )}

      {(value.status === 'range' || isSpecific) && (
        <div className="space-y-3">
          <div className={`grid gap-2 ${isSpecific ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
            <Field label={isSpecific ? copy.availability.date : copy.availability.start}>
              <TextInput type="date" value={draftStart} onChange={(event) => setDraftStart(event.target.value)} />
            </Field>
            {!isSpecific && (
              <Field label={copy.availability.end}>
                <TextInput type="date" min={draftStart || undefined} value={draftEnd} onChange={(event) => setDraftEnd(event.target.value)} />
              </Field>
            )}
          </div>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={saveSlot}>
              {editingId ? copy.availability.updatePeriod : isSpecific ? copy.availability.addDate : copy.availability.addPeriod}
            </Button>
            {editingId && (
              <Button type="button" variant="ghost" size="sm" onClick={resetDraft}>
                {copy.availability.cancelEdit}
              </Button>
            )}
          </div>
          <ul className="space-y-2">
            {value.slots.length === 0 ? (
              <li className="text-sm text-gray-500">{isSpecific ? copy.availability.noDate : copy.availability.noPeriod}</li>
            ) : (
              value.slots.map((slot) => (
                <li key={slot.id} className={`flex items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2 text-sm ${editingId === slot.id ? 'border-marine' : 'border-navy/[0.08]'}`}>
                  <span>
                    {slot.start_date === slot.end_date
                      ? format(slot.start_date)
                      : interpolate(copy.availability.period, { start: format(slot.start_date), end: format(slot.end_date) })}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => editSlot(slot.id)} className="rounded-lg p-2 text-marine hover:bg-lightblue" aria-label={copy.availability.edit}>
                      <Pencil size={15} />
                    </button>
                    <button type="button" onClick={() => removeSlot(slot.id)} className="rounded-lg p-2 text-red-600 hover:bg-red-50" aria-label={copy.availability.remove}>
                      <Trash2 size={15} />
                    </button>
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      <Field label={copy.availability.note} optionalLabel={copy.common.optional}>
        <TextInput value={value.note} maxLength={300} placeholder={copy.availability.notePlaceholder} onChange={(event) => onChange({ ...value, note: event.target.value })} />
      </Field>
    </div>
  );
}
