import { useRef, useState } from "react";
import { ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_MB, uploadImage } from "./upload";

type Props = {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (url: string) => void;
  /** Tailwind classes for the preview box (size / aspect ratio). */
  previewClassName?: string;
  fit?: "cover" | "contain";
  allowUrl?: boolean;
};

/** Upload (or paste a URL for) one image, with preview + remove. */
export function ImageField({ id, label, hint, value, onChange, previewClassName = "h-24 w-24", fit = "contain", allowUrl = true }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [broken, setBroken] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const url = await uploadImage(file);
      setBroken(false);
      onChange(url);
      toast.success(`${label} uploaded`, { description: "Remember to save your changes." });
    } catch (err) {
      toast.error("Upload failed", { description: (err as Error).message });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor={`${id}-url`}>{label}</Label>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className={`relative grid shrink-0 place-items-center overflow-hidden rounded-lg border border-dashed border-input bg-[repeating-conic-gradient(#0000000d_0_25%,transparent_0_50%)] bg-[length:16px_16px] ${previewClassName}`}>
          {value && !broken ? (
            <img src={value} alt={`${label} preview`} className={`h-full w-full ${fit === "cover" ? "object-cover" : "object-contain p-1"}`} onError={() => setBroken(true)} />
          ) : (
            <ImageIcon className="h-6 w-6 text-muted-foreground" aria-hidden />
          )}
          {busy && <div className="absolute inset-0 grid place-items-center bg-background/70"><Loader2 className="h-5 w-5 animate-spin" /></div>}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <input ref={inputRef} id={`${id}-file`} type="file" accept={ALLOWED_IMAGE_TYPES.join(",")} className="sr-only" onChange={(e) => pick(e.target.files?.[0])} data-testid={`input-file-${id}`} />
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()} data-testid={`button-upload-${id}`}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />} {value ? "Replace" : "Upload"}
            </Button>
            {value && (
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { onChange(""); setBroken(false); }} data-testid={`button-remove-${id}`}>
                <Trash2 className="mr-1.5 h-4 w-4" /> Remove
              </Button>
            )}
          </div>
          {allowUrl && (
            <Input id={`${id}-url`} value={value} onChange={(e) => { setBroken(false); onChange(e.target.value.trim()); }} placeholder="…or paste an https:// image link" maxLength={300} className="h-8 text-xs" />
          )}
          <p className="text-xs text-muted-foreground">{hint ?? `PNG, JPG or WebP, up to ${MAX_UPLOAD_MB} MB.`}</p>
        </div>
      </div>
    </div>
  );
}
