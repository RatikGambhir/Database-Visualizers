import { ArrowDownToLine, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apps, type DesktopApp } from '@/data/apps';

export function DownloadButton({ app }: { app: DesktopApp }) {
  const { name, url } = app;
  const Icon = url ? ArrowDownToLine : Clock;

  return (
    <Button
      className="download-button"
      nativeButton={!url}
      render={url ? <a href={url} download /> : undefined}
      disabled={!url}
    >
      <Icon aria-hidden="true" />
      <span className="download-button__label">
        <span>{url ? `Download ${name}` : name}</span>
        <span className="download-button__meta">{url ? 'macOS' : 'macOS · Coming soon'}</span>
      </span>
    </Button>
  );
}

export default function DownloadButtons() {
  return (
    <div className="download-actions" role="group" aria-label="Download macOS apps">
      {apps.map((app) => <DownloadButton key={app.id} app={app} />)}
    </div>
  );
}
