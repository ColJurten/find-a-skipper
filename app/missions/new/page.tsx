'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from '@/components/LocaleProvider';
import { Button, ErrorBanner, Field, LoadingState, Select, TextArea, TextInput } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { buildVerifyEmailPath, isEmailVerified } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { localizeBoatType, localizeMissionType, localizeZone } from '@/lib/i18n/options';
import { isSingleDayMissionType, missionTitle, parseDecimal, validateMissionForm } from '@/lib/mission';
import { isRecruiterRole } from '@/lib/onboarding';
import { MISSION_TYPES, NAVIGATION_ZONES, SKIPPER_BOAT_TYPES } from '@/lib/profile-options';
import type { MissionCurrency } from '@/lib/database.types';

export default function NewMissionPage() {
  const router = useRouter();
  const { copy } = useLocale();
  const [userId, setUserId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [type, setType] = useState<string>(MISSION_TYPES[0]);
  const [boatType, setBoatType] = useState<string>(SKIPPER_BOAT_TYPES[0]);
  const [zone, setZone] = useState<string>(NAVIGATION_ZONES[0]);
  const [departure, setDeparture] = useState('');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [hours, setHours] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<MissionCurrency>('EUR');
  const [onQuote, setOnQuote] = useState(false);
  const [permit, setPermit] = useState('');
  const [description, setDescription] = useState('');
  const singleDay = isSingleDayMissionType(type);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login?next=/missions/new');
        return;
      }
      if (!isEmailVerified(user)) {
        router.replace(buildVerifyEmailPath(user.email || null, '/missions/new'));
        return;
      }
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (!data || !isRecruiterRole(data.role)) {
        router.replace('/dashboard');
        return;
      }
      setUserId(user.id);
      setChecking(false);
    })();
  }, [router]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    const formError = validateMissionForm({ type, departure, startDate, endDate, hours, amount });
    if (formError) {
      setError(copy.missionForm.errors[formError]);
      return;
    }
    if (!userId) return;

    const durationHours = parseDecimal(hours);
    const compensationAmount = parseDecimal(amount);
    setLoading(true);
    const supabase = createClient();
    const { error: insertError } = await supabase
      .from('missions')
      .insert({
        title: missionTitle({ type, departure, destination }),
        poster_id: userId,
        status: 'open',
        type,
        boat_type: boatType,
        zone,
        departure: departure.trim(),
        destination: destination.trim() || null,
        start_date: startDate,
        end_date: singleDay ? null : endDate || null,
        duration_hours: durationHours,
        duration: durationHours ? `${durationHours} h` : null,
        compensation_amount: compensationAmount,
        currency,
        on_quote: onQuote,
        compensation: compensationAmount !== null ? `${compensationAmount} ${currency === 'EUR' ? '€' : '$'}` : null,
        requirements: permit.trim() || null,
        description: description.trim() || null,
      })
      .select('id')
      .single();
    setLoading(false);
    if (insertError) {
      setError(friendlyError(copy, insertError));
      return;
    }
    router.push('/my-missions?created=1');
    router.refresh();
  }

  if (checking) return <LoadingState label={copy.common.loading} />;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="font-display mb-1 text-3xl font-bold text-marine">{copy.missionForm.title}</h1>
      <p className="mb-6 text-sm text-gray-500">{copy.missionForm.subtitle}</p>
      <ErrorBanner message={error} />

      <form onSubmit={handleSubmit} noValidate className="rounded-2xl border border-navy/[0.08] bg-white p-5 sm:p-6">
        <div className="grid gap-x-4 sm:grid-cols-3">
          <Field label={copy.missionForm.type}>
            <Select value={type} onChange={(event) => { setType(event.target.value); if (isSingleDayMissionType(event.target.value)) setEndDate(''); }}>
              {MISSION_TYPES.map((value) => <option key={value} value={value}>{localizeMissionType(copy, value)}</option>)}
            </Select>
          </Field>
          <Field label={copy.missionForm.boat}>
            <Select value={boatType} onChange={(event) => setBoatType(event.target.value)}>
              {SKIPPER_BOAT_TYPES.map((value) => <option key={value} value={value}>{localizeBoatType(copy, value)}</option>)}
            </Select>
          </Field>
          <Field label={copy.missionForm.zone}>
            <Select value={zone} onChange={(event) => setZone(event.target.value)}>
              {NAVIGATION_ZONES.map((value) => <option key={value} value={value}>{localizeZone(copy, value)}</option>)}
            </Select>
          </Field>
        </div>

        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label={copy.missionForm.departure}>
            <TextInput required value={departure} maxLength={200} placeholder={copy.missionForm.departurePlaceholder} onChange={(event) => setDeparture(event.target.value)} />
          </Field>
          <Field label={copy.missionForm.destination} optionalLabel={copy.common.optional}>
            <TextInput value={destination} maxLength={200} placeholder={copy.missionForm.destinationPlaceholder} onChange={(event) => setDestination(event.target.value)} />
          </Field>
        </div>

        {singleDay ? (
          <Field label={copy.missionForm.date}>
            <TextInput type="date" required min={today} value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </Field>
        ) : (
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field label={copy.missionForm.startDate}>
              <TextInput type="date" required min={today} value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </Field>
            <Field label={copy.missionForm.endDate} optionalLabel={copy.common.optional}>
              <TextInput type="date" min={startDate || today} value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </Field>
          </div>
        )}

        <Field label={copy.missionForm.hours} optionalLabel={copy.common.optional}>
          <div className="relative">
            <TextInput inputMode="decimal" value={hours} placeholder={copy.missionForm.hoursPlaceholder} onChange={(event) => setHours(event.target.value)} className="pe-20" />
            <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-sm text-gray-400">{copy.missionForm.hoursSuffix}</span>
          </div>
        </Field>

        <div className="mb-4">
          <div className="grid gap-x-4 sm:grid-cols-[1fr_12rem]">
            <Field label={copy.missionForm.compensation}>
              <TextInput inputMode="decimal" value={amount} placeholder={copy.missionForm.amountPlaceholder} onChange={(event) => setAmount(event.target.value)} />
            </Field>
            <Field label={copy.missionForm.currency}>
              <Select value={currency} onChange={(event) => setCurrency(event.target.value as MissionCurrency)}>
                <option value="EUR">{copy.missionForm.currencies.EUR}</option>
                <option value="USD">{copy.missionForm.currencies.USD}</option>
              </Select>
            </Field>
          </div>
          <label className="-mt-1 flex items-start gap-2.5 text-sm text-gray-700">
            <input type="checkbox" checked={onQuote} onChange={(event) => setOnQuote(event.target.checked)} className="mt-0.5 h-4 w-4 accent-marine" />
            <span>
              <span className="font-semibold">{copy.missionForm.onQuote}</span>
              <span className="block text-xs text-gray-500">{copy.missionForm.onQuoteHint}</span>
            </span>
          </label>
        </div>

        <Field label={copy.missionForm.permit} optionalLabel={copy.common.optional}>
          <TextInput value={permit} maxLength={300} placeholder={copy.missionForm.permitPlaceholder} onChange={(event) => setPermit(event.target.value)} />
        </Field>

        <Field label={copy.missionForm.description}>
          <TextArea value={description} rows={6} maxLength={5000} placeholder={copy.missionForm.descriptionPlaceholder} onChange={(event) => setDescription(event.target.value)} />
        </Field>

        <div className="flex justify-end">
          <Button type="submit" variant="mission" loading={loading} size="sm">
            {copy.missionForm.submit}
          </Button>
        </div>
      </form>
    </main>
  );
}
