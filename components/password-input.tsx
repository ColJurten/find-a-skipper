'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useLocale } from '@/components/LocaleProvider';

export default function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  const { copy } = useLocale();

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className="w-full border border-gray-200 rounded-[10px] bg-white px-3.5 py-2.5 pe-12 text-[15px] outline-none focus:border-navy focus:ring-2 focus:ring-navy/15"
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className="absolute inset-y-0 end-0 flex items-center px-3 text-gray-500"
        aria-label={visible ? copy.passwordInput.hide : copy.passwordInput.show}
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}