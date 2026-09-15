import { Button } from '@/components/ui/button';

// Add the official macOS release URLs when they are available.
const downloads: { label: string; url?: string }[] = [
  { label: 'Download Tuple for macOS' },
  { label: 'Download HelixViz for macOS' },
];

export default function DownloadButtons() {
  return (
    <div className="download-actions" role="group" aria-label="Download macOS apps">
      {downloads.map(({ label, url }) => (
        <Button
          key={label}
          className="download-button"
          nativeButton={!url}
          render={url ? <a href={url} download /> : undefined}
          disabled={!url}
          title={url ? label : 'Download coming soon'}
        >
          {label}
        </Button>
      ))}
    </div>
  );
}
