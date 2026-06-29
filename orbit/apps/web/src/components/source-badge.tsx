import { SubmissionSource } from '@/lib/types';
import { cn } from '@/lib/utils';
import { MessageCircle, Slack, Globe } from 'lucide-react';

const SOURCE_META: Record<
  SubmissionSource,
  { label: string; text: string; bg: string; Icon: typeof Globe }
> = {
  APP: { label: 'App', text: 'text-text-secondary', bg: 'bg-primary-light', Icon: Globe },
  WHATSAPP: { label: 'WhatsApp', text: 'text-emerald-700', bg: 'bg-emerald-50', Icon: MessageCircle },
  SLACK: { label: 'Slack', text: 'text-violet-700', bg: 'bg-violet-50', Icon: Slack },
};

/** Where a request originated: created in the app, or ingested via the workflow. */
export function SourceBadge({ source }: { source: SubmissionSource }) {
  const meta = SOURCE_META[source] ?? SOURCE_META.APP;
  const { Icon } = meta;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-meta font-medium',
        meta.bg,
        meta.text,
      )}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}
