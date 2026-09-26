'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';
import { localizeBoatType, localizeZone } from '@/lib/i18n/options';
import { createClient } from '@/lib/supabase/client';
import { friendlyError } from '@/lib/errors';
import { Button, ErrorBanner, Field, FieldGroup, LoadingState, TextArea, TextInput } from '@/components/ui';
import MultiSelectTags from '@/components/multi-select-tags';
import PhoneInput from '@/components/phone-input';
import type { Profile } from '@/lib/database.types';
import { getPhoneStorageValue, phoneValueFromStored, validatePhoneValue, type PhoneValue } from '@/lib/phone';
import { dashboardHrefForRole, isRoleProfileReady, missingRoleFields } from '@/lib/onboarding';
import { NAVIGATION_ZONES, SKIPPER_BOAT_TYPES } from '@/lib/profile-options';

export default function OnboardingPage() {
  const router = useRouter();
  const { copy } = useLocale();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');

  const [phone, setPhone] = useState<PhoneValue>(phoneValueFromStored(null));
  const [companyName, setCompanyName] = useState('');
  const [fleetSize, setFleetSize] = useState('');
  const [zones, setZones] = useState<string[]>([]);
  const [boatTypes, setBoatTypes] = useState<string[]>([]);
  const [bio, setBio] = useState('');

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace('/login?next=/onboarding');
        return;
      }
      const { data, error: profileError } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      if (profileError || !data) {
        setError(profileError ? friendlyError(copy, profileError) : copy.onboarding.profileNotFound);
        setLoading(false);
        return;
      }
      const current = data as Profile;
      if (current.onboarding_completed_at) {
        router.replace(dashboardHrefForRole(current.role));
        return;
      }
      setProfile(current);
      setPhone(phoneValueFromStored(current.phone));
      setCompanyName(current.company_name || '');
      setFleetSize(current.fleet_size?.toString() || '');
      setZones(current.zones || []);
      setBoatTypes(current.boat_types || []);
      setBio(current.bio || '');
      setLoading(false);
    })();
  }, [copy, router]);

  const preview = useMemo<Profile | null>(() => {
    if (!profile) return null;
    return {
      ...profile,
      phone: getPhoneStorageValue(phone) || null,
      company_name: companyName || null,
      fleet_size: fleetSize ? Number(fleetSize) : null,
      zones,
      boat_types: boatTypes,
      bio,
    };
  }, [profile, phone, companyName, fleetSize, zones, boatTypes, bio]);

  const missing = preview ? missingRoleFields(preview) : [];

  function toggle(list: string[], setList: (value: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]);
  }

  async function saveProfile(markDone: boolean) {
    if (!profile || !preview) return;
    setError('');
    const phoneError = validatePhoneValue(phone, profile.role !== 'skipper');
    if (phoneError) {
      setError(copy.phone[phoneError]);
      return;
    }
    if (markDone && !isRoleProfileReady(preview)) {
      setError(copy.onboarding.completeRequired);
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        phone: getPhoneStorageValue(phone) || null,
        company_name: companyName.trim() || null,
        fleet_size: fleetSize ? Number(fleetSize) : null,
        zones,
        boat_types: boatTypes,
        bio: bio.trim() || null,
        onboarding_step: markDone ? 'done' : 'role_details',
        onboarding_completed_at: markDone ? new Date().toISOString() : null,
      })
      .eq('id', profile.id);
    setSaving(false);
    if (updateError) {
      setError(friendlyError(copy, updateError));
      return;
    }
    if (markDone) {
      router.replace(dashboardHrefForRole(profile.role));
      router.refresh();
    }
  }

  if (loading) return <LoadingState label={copy.common.loading} />;
  if (!profile) {
    return (
      <main className="mx-auto max-w-md px-4 py-10 sm:px-6">
        <ErrorBanner message={error || copy.onboarding.profileNotFound} />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <h1 className="font-display mb-2 text-3xl font-bold text-marine">{copy.onboarding.title}</h1>
      <p className="mb-6 text-sm text-gray-500">{copy.onboarding.description}</p>
      <ErrorBanner message={error} />

      <div className="mb-6 rounded-2xl border border-navy/[0.08] bg-white p-5">
        {missing.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 size={16} /> {copy.onboarding.ready}</p>
        ) : (
          <>
            <h2 className="mb-2 text-sm font-semibold">{copy.onboarding.checklist}</h2>
            <ul className="list-disc space-y-1 ps-5 text-sm text-gray-600">
              {missing.map((item) => <li key={item}>{copy.onboarding.missing[item]}</li>)}
            </ul>
          </>
        )}
      </div>

      <form onSubmit={(event) => event.preventDefault()}>
        <FieldGroup label={copy.common.phone}>
          <PhoneInput value={phone} onChange={setPhone} required={profile.role !== 'skipper'} />
        </FieldGroup>

        {(profile.role === 'broker' || profile.role === 'charter_company') && (
          <>
            <Field label={copy.signup.companyName}>
              <TextInput value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
            </Field>
            <Field label={copy.signup.fleetSize}>
              <TextInput type="number" min="0" inputMode="numeric" value={fleetSize} onChange={(event) => setFleetSize(event.target.value)} />
            </Field>
          </>
        )}

        {profile.role === 'skipper' && (
          <>
            <FieldGroup label={copy.signup.zones}>
              <MultiSelectTags options={NAVIGATION_ZONES} selected={zones} onToggle={(value) => toggle(zones, setZones, value)} labelFor={(value) => localizeZone(copy, value)} />
            </FieldGroup>
            <FieldGroup label={copy.signup.boatTypes}>
              <MultiSelectTags options={SKIPPER_BOAT_TYPES} selected={boatTypes} onToggle={(value) => toggle(boatTypes, setBoatTypes, value)} labelFor={(value) => localizeBoatType(copy, value)} />
            </FieldGroup>
            <Field label={copy.signup.bio}>
              <TextArea value={bio} maxLength={2000} placeholder={copy.signup.bioPlaceholder} onChange={(event) => setBio(event.target.value)} />
            </Field>
          </>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Button type="button" variant="outline" onClick={() => saveProfile(false)} disabled={saving}>
            {copy.onboarding.saveDraft}
          </Button>
          <Button type="button" onClick={() => saveProfile(true)} loading={saving}>
            {copy.onboarding.finish}
          </Button>
        </div>
      </form>
    </main>
  );
}
