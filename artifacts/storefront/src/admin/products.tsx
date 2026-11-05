import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  getListProductsQueryKey, useCreateProduct, useDeleteProduct, useListProducts, useUpdateProduct, type Product, type ProductInput,
} from "@workspace/api-client-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api-error";
import { useMoney, useSettings } from "@/lib/theme";
import { EmptyBlock, ErrorBlock } from "./common";
import { ImageField } from "./image-field";

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
const splitList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export default function ProductsPage() {
  const money = useMoney();
  const settings = useSettings();
  const products = useListProducts();
  const queryClient = useQueryClient();
  const remove = useDeleteProduct();
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [search, setSearch] = useState("");

  const list = (products.data ?? []).filter((p) => `${p.name} ${p.category}`.toLowerCase().includes(search.trim().toLowerCase()));
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });

  const confirmDelete = () => {
    if (!deleting) return;
    const p = deleting;
    remove.mutate(
      { id: p.id },
      {
        onSuccess: () => { toast.success(`Deleted “${p.name}”`); refresh(); setDeleting(null); },
        onError: (err) => toast.error("Couldn't delete", { description: errorMessage(err) }),
      },
    );
  };

  if (products.isError) return <ErrorBlock onRetry={() => products.refetch()} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-72">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products" className="pl-8" aria-label="Search products" />
        </div>
        <Button onClick={() => setEditing("new")} data-testid="button-new-product"><Plus className="mr-1.5 h-4 w-4" /> Add product</Button>
      </div>

      {products.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-64 w-full rounded-xl" />)}</div>
      ) : list.length === 0 ? (
        <EmptyBlock title={products.data?.length ? "No matches" : "No products yet"} description={products.data?.length ? "Try a different search." : "Add your first product so customers have something to order."} action={!products.data?.length && <Button onClick={() => setEditing("new")}><Plus className="mr-1.5 h-4 w-4" /> Add product</Button>} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => (
            <Card key={p.id} className="overflow-hidden" data-testid={`admin-card-product-${p.id}`}>
              <div className="aspect-[16/9] bg-muted">
                <img src={p.imageUrl || settings.heroImageUrl || "/hero.png"} alt="" loading="lazy" className="h-full w-full object-cover" onError={(e) => { const fallback = settings.heroImageUrl || "/hero.png"; if (!e.currentTarget.src.endsWith(fallback)) e.currentTarget.src = fallback; }} />
              </div>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">{p.name}</h3>
                    <p className="text-xs text-muted-foreground">{p.category}</p>
                  </div>
                  <span className="font-mono text-sm font-semibold tabular-nums">{money(p.price)}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant={p.available ? "secondary" : "outline"}>{p.available ? "Available" : "Hidden / sold out"}</Badge>
                  {p.stock != null && <Badge variant={p.stock === 0 ? "destructive" : p.stock <= 5 ? "outline" : "secondary"} data-testid={`badge-stock-${p.id}`}>{p.stock === 0 ? "Out of stock" : `${p.stock} left`}</Badge>}
                  {p.tags.slice(0, 2).map((t) => <Badge key={t} variant="outline">{t}</Badge>)}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setEditing(p)} data-testid={`button-edit-product-${p.id}`}><Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit</Button>
                  <Button variant="outline" size="sm" onClick={() => setDeleting(p)} aria-label={`Delete ${p.name}`} data-testid={`button-delete-product-${p.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editing && <ProductDialog product={editing === "new" ? null : editing} categories={settings.categories} onClose={() => setEditing(null)} onSaved={refresh} />}

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>This removes it from the shop. Past orders keep their copy of the name and price. To just hide it, edit it and turn off “Available”.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmDelete(); }} className="bg-destructive text-destructive-foreground" data-testid="button-confirm-delete">
              {remove.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ProductDialog({ product, categories, onClose, onSaved }: { product: Product | null; categories: string[]; onClose: () => void; onSaved: () => void }) {
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const [form, setForm] = useState({
    name: product?.name ?? "",
    slug: product?.slug ?? "",
    category: product?.category ?? categories[0] ?? "",
    price: product ? String(product.price) : "",
    description: product?.description ?? "",
    imageUrl: product?.imageUrl ?? "",
    tags: product?.tags.join(", ") ?? "",
    ingredients: product?.ingredients.join(", ") ?? "",
    available: product?.available ?? true,
    stock: product?.stock == null ? "" : String(product.stock),
  });
  const [slugTouched, setSlugTouched] = useState(!!product);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const pending = create.isPending || update.isPending;
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const categoryOptions = form.category && !categories.includes(form.category) ? [form.category, ...categories] : categories;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const price = Number(form.price);
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "Name is required";
    if (!/^[a-z0-9-]{1,120}$/.test(form.slug)) next.slug = "Lowercase letters, numbers and dashes only";
    if (!form.category) next.category = "Pick a category";
    if (form.price === "" || !Number.isFinite(price) || price < 0 || price > 1_000_000_000) next.price = "Enter a price of 0 or more";
    const stock = form.stock.trim() === "" ? null : Number(form.stock);
    if (stock !== null && (!Number.isInteger(stock) || stock < 0 || stock > 1_000_000)) next.stock = "Whole number of 0 or more, or leave empty";
    setErrors(next);
    if (Object.keys(next).length) return;

    const data: ProductInput = {
      name: form.name.trim(), slug: form.slug, category: form.category, price: Math.round(price * 100) / 100,
      description: form.description.trim(), imageUrl: form.imageUrl, tags: splitList(form.tags), ingredients: splitList(form.ingredients), available: form.available, stock,
    };
    const done = { onSuccess: () => { toast.success(product ? "Product updated" : "Product added"); onSaved(); onClose(); }, onError: (err: unknown) => toast.error("Couldn't save", { description: errorMessage(err) }) };
    if (product) update.mutate({ id: product.id, data }, done);
    else create.mutate({ data }, done);
  };

  const fieldError = (key: string) => errors[key] && <p className="text-xs text-destructive">{errors[key]}</p>;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{product ? `Edit ${product.name}` : "Add a product"}</DialogTitle>
          <DialogDescription>Prices you set here are the prices customers pay — the server never trusts prices sent by a browser.</DialogDescription>
        </DialogHeader>
        <form id="product-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="p-name">Name</Label>
            <Input id="p-name" value={form.name} maxLength={120} onChange={(e) => { set("name", e.target.value); if (!slugTouched) set("slug", slugify(e.target.value)); }} aria-invalid={!!errors.name} data-testid="input-product-name" />
            {fieldError("name")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-slug">URL name (slug)</Label>
            <Input id="p-slug" value={form.slug} maxLength={120} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value.toLowerCase()); }} aria-invalid={!!errors.slug} />
            {fieldError("slug")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-price">Price</Label>
            <Input id="p-price" type="number" inputMode="decimal" step="0.01" min="0" value={form.price} onChange={(e) => set("price", e.target.value)} aria-invalid={!!errors.price} data-testid="input-product-price" />
            {fieldError("price")}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="p-category">Category</Label>
            <Select value={form.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger id="p-category" data-testid="select-product-category"><SelectValue placeholder="Choose…" /></SelectTrigger>
              <SelectContent>{categoryOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Edit the category list in Branding.</p>
            {fieldError("category")}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="p-desc">Description</Label>
            <Textarea id="p-desc" value={form.description} maxLength={2000} rows={3} onChange={(e) => set("description", e.target.value)} data-testid="input-product-description" />
          </div>
          <div className="sm:col-span-2">
            <ImageField id="product-image" label="Photo" value={form.imageUrl} onChange={(url) => set("imageUrl", url)} previewClassName="h-24 w-36" fit="cover" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-tags">Tags</Label>
            <Input id="p-tags" value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="Bestseller, Vegan" />
            <p className="text-xs text-muted-foreground">Comma separated. The first tag shows on the photo.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-ingredients">Ingredients</Label>
            <Input id="p-ingredients" value={form.ingredients} onChange={(e) => set("ingredients", e.target.value)} placeholder="Flour, Water, Salt" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-stock">Stock (units left)</Label>
            <Input id="p-stock" type="number" inputMode="numeric" min="0" step="1" value={form.stock} onChange={(e) => set("stock", e.target.value)} placeholder="Not tracked" aria-invalid={!!errors.stock} data-testid="input-product-stock" />
            <p className="text-xs text-muted-foreground">Leave empty if you don't count stock. At 0 it shows “Sold out” and can't be ordered.</p>
            {fieldError("stock")}
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="p-available">Available</Label>
              <p className="text-xs text-muted-foreground">Turn off to show it as sold out.</p>
            </div>
            <Switch id="p-available" checked={form.available} onCheckedChange={(v) => set("available", v)} data-testid="input-product-available" />
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="product-form" disabled={pending} data-testid="button-save-product">{pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
