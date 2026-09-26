// Types manuels correspondant au schéma de supabase/schema.sql.
// Une fois la Supabase CLI installée, vous pourrez les régénérer automatiquement avec :
//   npx supabase gen types typescript --project-id <votre-project-id> > lib/database.types.ts
// En attendant, ce fichier suffit à typer proprement l'application.

export type Role = 'skipper' | 'owner' | 'broker' | 'charter_company' | 'admin';
export type MissionType = 'À la journée' | 'À la semaine' | 'Saisonnier' | 'Convoyage' | 'Permanent' | 'Autre';
export type MissionStatus = 'open' | 'assigned' | 'completed' | 'cancelled';
export type ApplicationStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';
export type AvailabilityStatus = 'immediate' | 'season' | 'from_date' | 'range' | 'specific' | 'unavailable';
export type MissionCurrency = 'EUR' | 'USD';
export type NotificationType =
  | 'new_application'
  | 'application_accepted'
  | 'application_rejected'
  | 'application_withdrawn'
  | 'mission_assigned'
  | 'mission_status_changed'
  | 'new_message';

export interface ProfileCertification {
  name: string;
  verified: boolean;
  authority?: string | null;
}

export interface AvailabilitySlot {
  id: string;
  skipper_id: string;
  start_date: string;
  end_date: string;
  created_at: string;
}

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;

  // Champs "demandeur" (owner / broker / charter_company)
  company_name: string | null;
  fleet_size: number | null;
  city: string | null;

  // Champs "skipper"
  experience_years: number | null;
  experience_range: string | null;
  zones: string[];
  boat_types: string[];
  languages: string[];
  permits: string | null;
  certifications: ProfileCertification[];
  bio: string | null;
  gallery_urls: string[];
  hourly_rate: string | null;
  availability_note: string | null;
  availability_status: AvailabilityStatus | null;
  available_from: string | null;
  availability_slots?: AvailabilitySlot[];
  identity_verified: boolean;
  onboarding_step: 'role_details' | 'done' | null;
  onboarding_completed_at: string | null;

  created_at: string;
}

export interface Mission {
  id: string;
  poster_id: string;
  status: MissionStatus;
  type: MissionType;
  boat_type: string;
  zone: string;
  departure: string;
  destination: string | null;
  start_date: string;
  end_date: string | null;
  duration: string | null;
  duration_hours: number | null;
  compensation: string | null;
  compensation_amount: number | null;
  currency: MissionCurrency;
  on_quote: boolean;
  description: string | null;
  requirements: string | null;
  applicants_count: number;
  is_featured: boolean;
  posted_at: string;
}

export interface Application {
  id: string;
  mission_id: string;
  skipper_id: string;
  status: ApplicationStatus;
  phone: string | null;
  message: string | null;
  applied_at: string;
  withdrawn_at: string | null;
  profiles?: Pick<Profile, 'id' | 'full_name'>;
  missions?: Mission;
}

export interface Conversation {
  id: string;
  mission_id: string;
  demandeur_id: string;
  skipper_id: string;
  created_at: string;
  missions?: Pick<Mission, 'departure' | 'destination'>;
  demandeur?: Pick<Profile, 'full_name'>;
  skipper?: Pick<Profile, 'full_name'>;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  text: string;
  created_at: string;
  read_at: string | null;
}

/** Limited public information returned by the get_profile_cards() RPC. */
export interface ProfileCard {
  id: string;
  role: Role;
  full_name: string;
  company_name: string | null;
  avatar_url: string | null;
}

/** Row returned by the my_conversations() RPC. */
export interface ConversationSummary {
  conversation_id: string;
  mission_id: string;
  mission_departure: string;
  mission_destination: string | null;
  other_id: string;
  other_role: Role;
  other_name: string;
  other_company: string | null;
  other_avatar_url: string | null;
  last_message: string | null;
  last_message_at: string;
  last_sender_id: string | null;
  unread_count: number;
}

export interface Favorite {
  id: string;
  user_id: string;
  skipper_id: string | null;
  mission_id: string | null;
  created_at: string;
}

export interface Review {
  id: string;
  mission_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer?: Pick<Profile, 'full_name'>;
  reviewee?: Pick<Profile, 'full_name'>;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

// Générique large utilisé par createBrowserClient / createServerClient.
// Remplacez par les types générés par la CLI Supabase quand vous l'installerez.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
