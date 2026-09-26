'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Anchor, Briefcase, Building2, Ship as ShipIcon } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { useLocale } from '@/components/LocaleProvider';
import { Button, ErrorBanner, Field, FieldGroup, Select, TextArea, TextInput } from '@/components/ui';
import AvailabilityEditor from '@/components/availability-editor';
import CertificationSelect from '@/components/certification-select';
import LanguageCheckboxes from '@/components/language-checkboxes';
import MultiSelectTags from '@/components/multi-select-tags';
import PasswordInput from '@/components/password-input';
import PhoneInput from '@/components/phone-input';
import PhotoPicker from '@/components/photo-picker';
import { createClient } from '@/lib/supabase/client';
import { buildEmailRedirectTo, buildVerifyEmailPath } from '@/lib/auth';
import { emptyAvailability, slotsForStatus, validateAvailability } from '@/lib/availability';
import { friendlyError } from '@/lib/errors';
import { localizeBoatType, localizeRole, localizeZone } from '@/lib/i18n/options';
import { prepareAvatar, stashPendingAvatar, uploadAvatar } from '@/lib/pending-avatar';
import { createEmptyPhoneValue, getPhoneStorageValue, validatePhoneValue } from '@/lib/phone';
import { EXPERIENCE_RANGES, NAVIGATION_ZONES, SKIPPER_BOAT_TYPES } from '@/lib/profile-options';
import type { Role } from '@/lib/database.types';

const ROLE_OPTIONS: { value: Role; icon: typeof Anchor }[] = [
  { value: 'skipper', icon: Anchor },
  { value: 'owner', icon: Briefcase },
  { value: 'broker', icon: Building2 },
  { value: 'charter_company', icon: ShipIcon },
];

function isSignupRole(value: string | null): value is Role {
  return value === 'skipper' || value === 'owner' || value === 'broker' || value === 'charter_company';
}

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { copy } = useLocale();
  const requestedRole = params.get('role');

  const [role, setRole] = useState<Role>(isSignupRole(requestedRole) ? requestedRole : 'skipper');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState(createEmptyPhoneValue('FR'));
  const [photo, setPhoto] = useState<File | null>(null);
  const [languages, setLanguages] = useState<string[]>([]);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  // Skipper
  const [experienceRange, setExperienceRange] = useState('');
  const [zones, setZones] = useState<string[]>([]);
  const [boatTypes, setBoatTypes] = useState<string[]>([]);
  const [permits, setPermits] = useState('');
  const [certifications, setCertifications] = useState<string[]>([]);
  const [availability, setAvailability] = useState(emptyAvailability());
  const [bio, setBio] = useState('');
  // Owner / broker / agency
  const [companyName, setCompanyName] = useState('');
  const [fleetSize, setFleetSize] = useState('');
  const [city, setCity] = useState('');

  const isSkipper = role === 'skipper';
  const isCompany = role === 'broker' || role === 'charter_company';

  function toggle(list: string[], setList: (value: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]);
  }

  function validate(): string | null {
    if (!fullName.trim() || !email.trim() || !password || !confirmPassword || (isCompany && !companyName.trim())) return copy.signup.errors.requiredFields;
    if (password.length < 10) return copy.signup.errors.passwordLength;
    if (password !== confirmPassword) return copy.signup.errors.passwordMismatch;
    const phoneError = validatePhoneValue(phone, false);
    if (phoneError) return copy.phone[phoneError];
    if (isSkipper) {
      if (languages.length === 0) return copy.signup.errors.languagesRequired;
      const availabilityError = validateAvailability(availability);
      if (availabilityError) return copy.availability.errors[availabilityError];
    }
    if (!acceptedLegal) return copy.signup.errors.acceptLegal;
    return null;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: buildEmailRedirectTo(window.location.origin, '/dashboard'),
        data: {
          role,
          full_name: fullName.trim(),
          phone: getPhoneStorageValue(phone) || null,
          languages,
          company_name: isCompany ? companyName.trim() : null,
          fleet_size: isCompany && fleetSize ? fleetSize : null,
          city: role === 'owner' ? city.trim() || null : null,
          experience_range: isSkipper ? experienceRange || null : null,
          zones: isSkipper ? zones : [],
          boat_types: isSkipper ? boatTypes : [],
          permits: isSkipper ? permits.trim() || null : null,
          certifications: isSkipper ? certifications.map((name) => ({ name, verified: false })) : [],
          availability_status: isSkipper ? availability.status : null,
          available_from: isSkipper && availability.status === 'from_date' ? availability.fromDate : null,
          availability_slots: isSkipper ? slotsForStatus(availability).map(({ start_date, end_date }) => ({ start_date, end_date })) : [],
          availability_note: isSkipper ? availability.note.trim() || null : null,
          bio: isSkipper ? bio.trim() || null : null,
        },
      },
    });

    if (signUpError) {
      setLoading(false);
      setError(friendlyError(copy, signUpError));
      return;
    }
    // Supabase hides existing accounts behind a user without identities.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setLoading(false);
      setError(copy.errors.userExists);
      return;
    }

    let photoPending = false;
    if (photo) {
      const prepared = await prepareAvatar(photo);
      if (data.session && data.user) {
        try {
          await uploadAvatar(supabase, data.user.id, prepared);
        } catch {
          photoPending = await stashPendingAvatar(email, prepared);
        }
      } else {
        photoPending = await stashPendingAvatar(email, prepared);
      }
    }

    setLoading(false);
    if (data.session) {
      router.push('/dashboard');
      router.refresh();
      return;
    }
    const verifyPath = buildVerifyEmailPath(email.trim(), '/dashboard');
    router.replace(photoPending ? `${verifyPath}&photo=pending` : verifyPath);
  }

  return (
    <>
      <ErrorBanner message={error} />

      <FieldGroup label={copy.signup.chooseRole}>
        <div className="grid grid-cols-2 gap-2">
          {ROLE_OPTIONS.map(({ value, icon: Icon }) => (
            <button
              key={value}
              type="button"
              aria-pressed={role === value}
              onClick={() => setRole(value)}
              className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-center text-sm font-semibold transition ${
                role === value ? 'border-marine bg-marine text-white' : 'border-gray-200 bg-white text-anthracite hover:border-marine/40'
              }`}
            >
              <Icon size={15} className="shrink-0" /> {localizeRole(copy, value)}
            </button>
          ))}
        </div>
      </FieldGroup>

      <form onSubmit={handleSubmit} noValidate>
        <FieldGroup label={copy.photo.label}>
          <PhotoPicker name={fullName} file={photo} onChange={setPhoto} onError={setError} />
        </FieldGroup>

        <Field label={isSkipper ? copy.signup.fullName : copy.signup.contactName}>
          <TextInput required autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} />
        </Field>

        {isCompany && (
          <>
            <Field label={copy.signup.companyName}>
              <TextInput required autoComplete="organization" value={companyName} onChange={(event) => setCompanyName(event.target.value)} />
            </Field>
            <Field label={copy.signup.fleetSize} optionalLabel={copy.common.optional}>
              <TextInput type="number" min="0" inputMode="numeric" value={fleetSize} onChange={(event) => setFleetSize(event.target.value)} />
            </Field>
          </>
        )}
        {role === 'owner' && (
          <Field label={copy.signup.city} optionalLabel={copy.common.optional}>
            <TextInput autoComplete="address-level2" value={city} onChange={(event) => setCity(event.target.value)} />
          </Field>
        )}

        <Field label={copy.common.email}>
          <TextInput type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <Field label={copy.common.password} hint={copy.signup.passwordHint}>
          <PasswordInput required minLength={10} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </Field>
        <Field label={copy.common.confirmPassword}>
          <PasswordInput required minLength={10} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
        </Field>
        <FieldGroup label={copy.common.phone}>
          <PhoneInput value={phone} onChange={setPhone} />
        </FieldGroup>

        <FieldGroup label={copy.languages.label} hint={copy.languages.hint}>
          <LanguageCheckboxes selected={languages} onChange={setLanguages} />
        </FieldGroup>

        {isSkipper && (
          <>
            <Field label={copy.experience.label}>
              <Select value={experienceRange} onChange={(event) => setExperienceRange(event.target.value)}>
                <option value="">{copy.experience.choose}</option>
                {EXPERIENCE_RANGES.map((range) => (
                  <option key={range} value={range}>{copy.experience.ranges[range]}</option>
                ))}
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

        <label className="mb-5 flex items-start gap-2.5">
          <input type="checkbox" checked={acceptedLegal} onChange={(event) => setAcceptedLegal(event.target.checked)} className="mt-1.5 h-4 w-4 accent-marine" />
          <span className="text-sm leading-6 text-gray-600">
            {copy.signup.legalIntro}{' '}
            <Link href="/cgu" className="font-semibold text-marine underline">{copy.signup.legalTerms}</Link>{' '}
            {copy.signup.legalAnd}{' '}
            <Link href="/confidentialite" className="font-semibold text-marine underline">{copy.signup.legalPrivacy}</Link>. {copy.signup.legalRead}{' '}
            <Link href="/cookies" className="font-semibold text-marine underline">{copy.signup.legalCookies}</Link>.
          </span>
        </label>

        <Button type="submit" loading={loading} className="w-full">
          {copy.signup.submit}
        </Button>
      </form>

      {!isSkipper && <p className="mt-3 text-center text-xs text-gray-500">{copy.signup.recruiterNote}</p>}
      <p className="mt-5 text-center text-sm text-gray-500">
        {copy.signup.alreadyAccount}{' '}
        <Link href="/login" className="font-semibold text-marine underline">{copy.signup.login}</Link>
      </p>
    </>
  );
}

export default function SignupPage() {
  const { copy } = useLocale();

  return (
    <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <div className="mb-5 flex justify-center"><BrandLogo size="lg" /></div>
      <h1 className="font-display mb-6 text-center text-2xl font-bold text-marine">{copy.signup.title}</h1>
      <Suspense fallback={null}>
        <SignupForm />
      </Suspense>
    </main>
  );
}
