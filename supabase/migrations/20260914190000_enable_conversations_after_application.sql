-- Allow messaging as soon as an application exists (pending or accepted).
-- This aligns product flow: mission -> apply -> discuss.

DROP POLICY IF EXISTS "Participants can read their conversations" ON public.conversations;
CREATE POLICY "Participants can read their conversations"
  ON public.conversations FOR SELECT
  USING (
    (auth.uid() = demandeur_id OR auth.uid() = skipper_id)
    AND EXISTS (
      SELECT 1
      FROM public.applications a
      WHERE a.mission_id = conversations.mission_id
        AND a.skipper_id = conversations.skipper_id
        AND a.status IN ('pending', 'accepted')
    )
  );

DROP POLICY IF EXISTS "Demandeur can start a conversation" ON public.conversations;
CREATE POLICY "Demandeur can start a conversation"
  ON public.conversations FOR INSERT
  WITH CHECK (
    auth.uid() = demandeur_id
    AND EXISTS (
      SELECT 1
      FROM public.missions m
      WHERE m.id = conversations.mission_id
        AND m.poster_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1
      FROM public.applications a
      WHERE a.mission_id = conversations.mission_id
        AND a.skipper_id = conversations.skipper_id
        AND a.status IN ('pending', 'accepted')
    )
  );

DROP POLICY IF EXISTS "Skipper can start conversation after applying" ON public.conversations;
CREATE POLICY "Skipper can start conversation after applying"
  ON public.conversations FOR INSERT
  WITH CHECK (
    auth.uid() = skipper_id
    AND EXISTS (
      SELECT 1
      FROM public.applications a
      WHERE a.mission_id = conversations.mission_id
        AND a.skipper_id = auth.uid()
        AND a.status IN ('pending', 'accepted')
    )
    AND EXISTS (
      SELECT 1
      FROM public.missions m
      WHERE m.id = conversations.mission_id
        AND m.poster_id = conversations.demandeur_id
    )
  );

DROP POLICY IF EXISTS "Participants can read messages" ON public.messages;
CREATE POLICY "Participants can read messages"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = conversation_id
        AND (auth.uid() = c.demandeur_id OR auth.uid() = c.skipper_id)
        AND EXISTS (
          SELECT 1
          FROM public.applications a
          WHERE a.mission_id = c.mission_id
            AND a.skipper_id = c.skipper_id
            AND a.status IN ('pending', 'accepted')
        )
    )
  );

DROP POLICY IF EXISTS "Participants can send messages" ON public.messages;
CREATE POLICY "Participants can send messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = conversation_id
        AND (auth.uid() = c.demandeur_id OR auth.uid() = c.skipper_id)
        AND EXISTS (
          SELECT 1
          FROM public.applications a
          WHERE a.mission_id = c.mission_id
            AND a.skipper_id = c.skipper_id
            AND a.status IN ('pending', 'accepted')
        )
    )
  );
