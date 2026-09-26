'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';
import AvailabilityEditor from '@/components/availability-editor';
import CertificationSelect from '@/components/certification-select';
import LanguageCheckboxes from '@/components/language-checkboxes';
import MultiSelectTags from '@/components/multi-select-tags';
import PhoneInput from '@/components/phone-input';
import PhotoPicker from '@/components/photo-picker';
import SkipperReviews, { type ReviewWithContext } from '@/components/skipper-reviews';
import { Avatar, Badge, Button, ErrorBanner, Field, FieldGroup, LoadingState, Select, SuccessBanner, TextArea, TextInput } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { effectiveAvailabilityStatus, emptyAvailability, slotsForStatus, validateAvailability, type AvailabilityValue } from '@/lib/availability';
import { describeAvailability } from '@/lib/availability-format';
import { friendlyError } from '@/lib/errors';
import { languageName, formatList } from '@/lib/i18n/format';
import { localizeBoatType, localizeRole, localizeZone } from '@/lib/i18n/options';
import { displayName, fetchProfileCards, resolveAvatarUrl } from '@/lib/media';
import { missionRoute } from '@/lib/mission';
import { prepareAvatar, uploadAvatar } from '@/lib/pending-avatar';
import { getPhoneStorageValue, phoneValueFromStored, validatePhoneValue, type PhoneValue } from '@/lib/phone';
import { normalizeLanguages, normalizeProfileCertifications } from '@/lib/profile';
import { EXPERIENCE_RANGES, NAVIGATION_ZONES, SKIPPER_BOAT_TYPES, profileExperienceRange } from '@/lib/profile-options';
import type { AvailabilitySlot, Mission, Profile, Review } from '@/lib/database.types';

type ProfileWithSlots = Profile & { availability_slots?: AvailabilitySlot[] };

function availabilityFromProfile(profile: ProfileWithSlots): AvailabilityValue {
  const status = effectiveAvailabilityStatus(profile);
  if (!status) return { ...emptyAvailability(), note: profile.availability_note || '' };
  return {
    status,
    fromDate: profile.available_from || '',
    slots: (profile.availability_slots || []).map((slot) => ({ id: slot.id, start_date: slot.start_date, end_date: slot.end_date })),
    note: profile.availability_note || '',
  };
}

async function fetchProfileData() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('*, availability_slots(*)').eq('id', user.id).single();
  const profile = data as ProfileWithSlots | null;
  let reviews: ReviewWithContext[] = [];
  if (profile?.role === 'skipper') {
    const { data: reviewRows } = await supabase.from('reviews').select('*, missions(departure, destination)').eq('reviewee_id', user.id).order('created_at', { ascending: false });
    const rows = (reviewRows as unknown as Array<Review & { missions: Pick<Mission, 'departure' | 'destination'> | null }>) || [];
    const cards = await fetchProfileCards(supabase, rows.map((row) => row.reviewer_id));
    reviews = rows.map((row) => ({ ...row, reviewerName: displayName(cards[row.reviewer_id]), missionLabel: row.missions ? missionRoute(row.missions) : null }));
  }
  return { email: user.email || '', profile, avatarUrl: profile ? await resolveAvatarUrl(supabase, profile.avatar_url) : null, reviews };
}

export default function ProfilePage() {
  const { copy, locale } = useLocale();
  const [email, setEmail] = useState('');
  const [profile, setProfile] = useState<ProfileWithSlots | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ReviewWithContext[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState<PhoneValue>(phoneValueFromStored(null));
  const [photo, setPhoto] = useState<File | null>(null);
  const [languages, setLanguages] = useState<string[]>([]);
  const [experienceRange, setExperienceRange] = useState('');
  const [zones, setZones] = useState<string[]>([]);
  const [boatTypes, setBoatTypes] = useState<string[]>([]);
  const [certifications, setCertifications] = useState<string[]>([]);
  const [permits, setPermits] = useState('');
  const [availability, setAvailability] = useState<AvailabilityValue>(emptyAvailability());
  const [bio, setBio] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [fleetSize, setFleetSize] = useState('');
  const [city, setCity] = useState('');

  const fillForm = useCallback((current: ProfileWithSlots) => {
    setFullName(current.full_name);
    setPhone(phoneValueFromStored(current.phone));
    setLanguages(normalizeLanguages(current.languages));
    setExperienceRange(profileExperienceRange(current) || '');
    setZones(current.zones || []);
    setBoatTypes(current.boat_types || []);
    setCertifications(normalizeProfileCertifications(current.certifications).map((cert) => cert.name));
    setPermits(current.permits || '');
    setAvailability(availabilityFromProfile(current));
    setBio(current.bio || '');
    setCompanyName(current.company_name || '');
    setFleetSize(current.fleet_size?.toString() || '');
    setCity(current.city || '');
    setPhoto(null);
  }, []);

  const applyData = useCallback((data: Awaited<ReturnType<typeof fetchProfileData>>) => {
    if (data) {
      setEmail(data.email);
      setProfile(data.profile);
      if (data.profile) fillForm(data.profile);
      setAvatarUrl(data.avatarUrl);
      setReviews(data.reviews);
    }
    setLoading(false);
  }, [fillForm]);

  const load = useCallback(async () => applyData(await fetchProfileData()), [applyData]);

  useEffect(() => {
    void fetchProfileData().then(applyData);
  }, [applyData]);

  function toggle(list: string[], setList: (value: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]);
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (!profile) return;
    setError('');
    setSaved('');
    const isSkipper = profile.role === 'skipper';
    if (!fullName.trim()) {
      setError(copy.signup.errors.requiredFields);
      return;
    }
    const phoneError = validatePhoneValue(phone, !isSkipper);
    if (phoneError) {
      setError(copy.phone[phoneError]);
      return;
    }
    if (isSkipper) {
      if (languages.length === 0) {
        setError(copy.signup.errors.languagesRequired);
        return;
      }
      const availabilityError = validateAvailability(availability);
      if (availabilityError) {
        setError(copy.availability.errors[availabilityError]);
        return;
      }
    }

    setSaving(true);
    const supabase = createClient();
    try {
      let nextAvatar = profile.avatar_url;
      if (photo) nextAvatar = await uploadAvatar(supabase, profile.id, await prepareAvatar(photo));

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          full_name: fullName.trim(),
          phone: getPhoneStorageValue(phone) || null,
          avatar_url: nextAvatar,
          languages,
          ...(isSkipper
            ? {
                experience_range: experienceRange || null,
                zones,
                boat_types: boatTypes,
                certifications: certifications.map((name) => ({ name, verified: false })),
                permits: permits.trim() || null,
                availability_status: availability.status,
                available_from: availability.status === 'from_date' ? availability.fromDate : null,
                availability_note: availability.note.trim() || null,
                bio: bio.trim() || null,
              }
            : {
                company_name: companyName.trim() || null,
                fleet_size: fleetSize ? Number(fleetSize) : null,
                city: city.trim() || null,
              }),
        })
        .eq('id', profile.id);
      if (updateError) throw updateError;

      if (isSkipper) {
        const { error: deleteError } = await supabase.from('availability_slots').delete().eq('skipper_id', profile.id);
        if (deleteError) throw deleteError;
        const slots = slotsForStatus(availability);
        if (slots.length) {
          const { error: insertError } = await supabase
            .from('availability_slots')
            .insert(slots.map((slot) => ({ skipper_id: profile.id, start_date: slot.start_date, end_date: slot.end_date })));
          if (insertError) throw insertError;
        }
      }
      await load();
      setEditing(false);
      setSaved(copy.profile.saved);
    } catch (saveError) {
      setError(friendlyError(copy, saveError));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label={copy.common.loading} />;
  if (!profile) {
    return (
      <main className="mx-auto max-w-md px-4 py-10 sm:px-6">
        <ErrorBanner message={copy.errors.signInRequired} />
      </main>
    );
  }

  const isSkipper = profile.role === 'skipper';
  const range = profileExperienceRange(profile);
  const certificationNames = normalizeProfileCertifications(profile.certifications).map((cert) => cert.name);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <SuccessBanner message={saved} />
      {!editing ? (
        <>
          <section className="mb-5 flex flex-col items-center gap-4 rounded-2xl border border-navy/[0.08] bg-white p-6 text-center sm:flex-row sm:text-start">
            <Avatar name={profile.full_name} url={avatarUrl} size={112} className="border-4 border-lightblue" />
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-2xl font-bold text-marine">{profile.full_name}</h1>
              <div className="mt-1 flex flex-wrap justify-center gap-2 sm:justify-start">
                <Badge>{localizeRole(copy, profile.role)}</Badge>
                {isSkipper && range && <Badge tone="muted">{copy.experience.ranges[range]}</Badge>}
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => { setSaved(''); setEditing(true); }}>
              <Pencil size={14} /> {copy.profile.edit}
            </Button>
          </section>

          <dl className="divide-y divide-navy/[0.06] rounded-2xl border border-navy/[0.08] bg-white px-5">
            <Row label={copy.common.email} value={email} ltr />
            <Row label={copy.common.phone} value={profile.phone || copy.common.notSpecified} ltr={Boolean(profile.phone)} />
            <Row label={copy.languages.label} value={(profile.languages || []).length ? formatList((profile.languages || []).map((code) => languageName(code, locale)), locale) : copy.common.notSpecified} />
            {!isSkipper && profile.company_name && <Row label={copy.signup.companyName} value={profile.company_name} />}
            {!isSkipper && profile.fleet_size !== null && <Row label={copy.signup.fleetSize} value={String(profile.fleet_size)} />}
            {!isSkipper && profile.city && <Row label={copy.signup.city} value={profile.city} />}
            {isSkipper && (
              <>
                <Row label={copy.availability.label} value={describeAvailability(copy, locale, profile).join(' · ')} />
                <Row label={copy.signup.zones} value={formatList((profile.zones || []).map((zone) => localizeZone(copy, zone)), locale) || copy.common.notSpecified} />
                <Row label={copy.signup.boatTypes} value={formatList((profile.boat_types || []).map((boat) => localizeBoatType(copy, boat)), locale) || copy.common.notSpecified} />
                {(certificationNames.length > 0 || profile.permits) && <Row label={copy.skipperProfile.qualifications} value={[...certificationNames, profile.permits].filter(Boolean).join(', ')} />}
                {profile.bio && <Row label={copy.signup.bio} value={profile.bio} />}
              </>
            )}
          </dl>

          {isSkipper && <SkipperReviews reviews={reviews} title={copy.profile.reviews} />}
        </>
      ) : (
        <form onSubmit={handleSave} noValidate>
          <h1 className="font-display mb-6 text-2xl font-bold text-marine">{copy.profile.edit}</h1>
          <ErrorBanner message={error} />
          <FieldGroup label={copy.photo.label}>
            <PhotoPicker name={fullName} currentUrl={avatarUrl} file={photo} onChange={setPhoto} onError={setError} />
          </FieldGroup>
          <Field label={isSkipper ? copy.signup.fullName : copy.signup.contactName}>
            <TextInput required value={fullName} onChange={(event) => setFullName(event.target.value)} />
          </Field>
          <FieldGroup label={copy.common.phone}>
            <PhoneInput value={phone} onChange={setPhone} />
          </FieldGroup>
          <FieldGroup label={copy.languages.label} hint={copy.languages.hint}>
            <LanguageCheckboxes selected={languages} onChange={setLanguages} />
          </FieldGroup>

          {!isSkipper ? (
            <>
              <Field label={copy.signup.companyName} optionalLabel={profile.role === 'owner' ? copy.common.optional : undefined}>
                <TextInput value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
              </Field>
              <Field label={copy.signup.fleetSize} optionalLabel={copy.common.optional}>
                <TextInput type="number" min="0" inputMode="numeric" value={fleetSize} onChange={(event) => setFleetSize(event.target.value)} />
              </Field>
              <Field label={copy.signup.city} optionalLabel={copy.common.optional}>
                <TextInput value={city} onChange={(event) => setCity(event.target.value)} />
              </Field>
            </>
          ) : (
            <>
              <Field label={copy.experience.label}>
                <Select value={experienceRange} onChange={(event) => setExperienceRange(event.target.value)}>
                  <option value="">{copy.experience.choose}</option>
                  {EXPERIENCE_RANGES.map((value) => <option key={value} value={value}>{copy.experience.ranges[value]}</option>)}
                </Select>
              </Field>
              <FieldGroup label={copy.signup.zones}>
                <MultiSelectTags options={NAVIGATION_ZONES} selected={zones} onToggle={(value) => toggle(zones, setZones, value)} labelFor={(value) => localizeZone(copy, value)} />
              </FieldGroup>
              <FieldGroup label={copy.signup.boatTypes}>
                <MultiSelectTags options={SKIPPER_BOAT_TYPES} selected={boatTypes} onToggle={(value) => toggle(boatTypes, setBoatTypes, value)} labelFor={(value) => localizeBoatType(copy, value)} />
              </FieldGroup>
              <FieldGroup label={copy.signup.certifications}>
                <CertificationSelect selected={certifications} onToggle={(value) => toggle(certifications, setCertifications, value)} />
              </FieldGroup>
              <Field label={copy.signup.permits} optionalLabel={copy.common.optional}>
                <TextInput value={permits} onChange={(event) => setPermits(event.target.value)} />
              </Field>
              <FieldGroup label={copy.availability.label}>
                <AvailabilityEditor value={availability} onChange={setAvailability} />
              </FieldGroup>
              <Field label={copy.signup.bio}>
                <TextArea value={bio} maxLength={2000} placeholder={copy.signup.bioPlaceholder} onChange={(event) => setBio(event.target.value)} />
              </Field>
            </>
          )}

          <div className="mt-2 flex gap-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => { fillForm(profile); setError(''); setEditing(false); }}>
              {copy.common.cancel}
            </Button>
            <Button type="submit" loading={saving} className="flex-1">
              {copy.common.save}
            </Button>
          </div>
        </form>
      )}

      <section className="mt-6 rounded-2xl border border-navy/[0.08] bg-white p-5">
        <h2 className="mb-1 font-semibold">{copy.profile.privacyTitle}</h2>
        <p className="mb-4 text-sm text-gray-500">{copy.profile.privacyBody}</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/confidentialite" className="rounded-lg bg-lightblue px-3 py-2 text-sm font-semibold text-marine">{copy.profile.privacyLink}</Link>
          <Link href="/account" className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{copy.profile.deleteAccount}</Link>
        </div>
      </section>
    </main>
  );
}

function Row({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 sm:flex-row sm:justify-between sm:gap-6">
      <dt className="shrink-0 text-sm text-gray-500">{label}</dt>
      <dd dir="auto" className="whitespace-pre-line text-sm font-medium sm:text-end">{ltr ? <bdi dir="ltr">{value}</bdi> : value}</dd>
    </div>
  );
}
