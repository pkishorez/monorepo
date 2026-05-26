import { useCallback, useMemo, useRef, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useLiveQuery } from '@tanstack/react-db';
import { Effect, Schema } from 'effect';
import { Badge } from '@monorepo/frontend/components/ui/badge';
import { Button } from '@monorepo/frontend/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@monorepo/frontend/components/ui/card';
import { Input } from '@monorepo/frontend/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@monorepo/frontend/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@monorepo/frontend/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@monorepo/frontend/components/ui/table';
import { Upload, Trash2 } from 'lucide-react';
import { ProjectionOutputSchema } from '@/domain';
import {
  transactionsCollection,
  replaceTransactions,
  overridesCollection,
  settingsCollection,
  settingsUtils,
} from '@/routes/internal/collections';
import { FinancesClient, financesRuntime } from '@/routes/internal/effect';
import { mergeTransactionsWithOverrides } from '@/orchestration';

type CategoryType = 'income' | 'spend' | 'transfer' | 'ignore';

export const Route = createFileRoute('/_layout/settings')({
  component: SettingsPage,
});

function inferType(
  transactions: { category: string; type: string; is_transfer: boolean }[],
  category: string,
): { label: string; variant: 'secondary' | 'outline' } {
  const matching = transactions.filter((t) => t.category === category);
  if (matching.length === 0) return { label: 'no data', variant: 'outline' };

  if (matching.some((t) => t.is_transfer))
    return { label: 'transfer', variant: 'secondary' };
  const credits = matching.filter((t) => t.type === 'credit').length;
  const debits = matching.filter((t) => t.type === 'debit').length;
  if (credits > debits) return { label: 'income', variant: 'secondary' };
  return { label: 'spend', variant: 'secondary' };
}

function DataManagementSection() {
  const txnQuery = useLiveQuery(transactionsCollection);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const transactions = txnQuery.data ?? [];
  const transactionCount = transactions.length;

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const raw = JSON.parse(e.target?.result as string);
          const decoded = Schema.decodeUnknownSync(ProjectionOutputSchema)(raw);
          replaceTransactions(decoded.transactions as never);
          setUploadError(null);
        } catch (err) {
          setUploadError(
            err instanceof Error ? err.message : 'Failed to parse JSON file',
          );
        }
      };
      reader.readAsText(file);

      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [],
  );

  const handleClearData = useCallback(() => {
    const keys = Array.from(transactionsCollection.state.keys());
    if (keys.length > 0) {
      transactionsCollection.delete(keys);
    }
    setUploadError(null);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data Management</CardTitle>
        <CardDescription>
          Upload, replace, or clear transaction data
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            {transactionCount > 0
              ? `${transactionCount} transactions loaded`
              : 'No transactions loaded'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload data-icon="inline-start" />
            Upload JSON
          </Button>

          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="destructive" disabled={transactionCount === 0}>
                  <Trash2 data-icon="inline-start" />
                  Clear Data
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear all transactions?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove all {transactionCount} transactions. This
                  action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={handleClearData}
                >
                  Clear Data
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {uploadError && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {uploadError}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type TypeFilter = 'all' | 'auto' | CategoryType | 'no data';

function CategoryTypeMappingSection() {
  const txnQuery = useLiveQuery(transactionsCollection);
  const ovdQuery = useLiveQuery(overridesCollection);
  const settingsQuery = useLiveQuery(settingsCollection);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  const transactions = txnQuery.data ?? [];
  const overrides = ovdQuery.data ?? [];
  const settings = settingsQuery.data ?? [];

  const merged = useMemo(
    () => mergeTransactionsWithOverrides(transactions, overrides),
    [transactions, overrides],
  );

  const settingsMap = useMemo(() => {
    const map = new Map<string, CategoryType>();
    for (const s of settings) {
      map.set(s.category, s.type);
    }
    return map;
  }, [settings]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const t of merged) {
      if (t.category) set.add(t.category);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [merged]);

  const filteredCategories = useMemo(() => {
    let result = categories;

    if (search) {
      result = result.filter((c) =>
        c.toLowerCase().includes(search.toLowerCase()),
      );
    }

    if (typeFilter !== 'all') {
      result = result.filter((category) => {
        const assigned = settingsMap.get(category);
        if (typeFilter === 'auto') return !assigned;
        if (typeFilter === 'no data') {
          if (assigned) return false;
          return inferType(merged, category).label === 'no data';
        }
        if (assigned) return assigned === typeFilter;
        return inferType(merged, category).label === typeFilter;
      });
    }

    return result;
  }, [categories, search, typeFilter, settingsMap, merged]);

  const handleTypeChange = useCallback(
    (category: string, value: string) => {
      if (value === 'auto') {
        const keys = Array.from(settingsCollection.state.keys());
        const key = keys.find((k) => {
          const item = settingsCollection.state.get(k);
          return item?.category === category;
        });
        if (key) {
          settingsCollection.delete([key]);
        }
        financesRuntime
          .runPromise(
            Effect.gen(function* () {
              const { client } = yield* FinancesClient;
              yield* client.deleteCategorySetting({ category });
            }),
          )
          .catch(() => {});
        return;
      }

      const now = new Date().toISOString();
      settingsUtils.upsert({
        value: { category, type: value as CategoryType },
        meta: { _v: '1', _e: 'CategorySetting', _d: false, _u: now },
      });

      financesRuntime
        .runPromise(
          Effect.gen(function* () {
            const { client } = yield* FinancesClient;
            yield* client.saveCategorySetting({
              category,
              type: value as CategoryType,
            });
          }),
        )
        .catch(() => {});
    },
    [settings],
  );

  if (merged.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Category Type Mapping</CardTitle>
          <CardDescription>
            Upload transactions first to configure category types
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Category Type Mapping</CardTitle>
        <CardDescription>
          Configure how each category is treated in the dashboard
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search categories..."
            value={search}
            onChange={(e) => setSearch((e.target as HTMLInputElement).value)}
            className="max-w-sm"
          />
          <Select
            value={typeFilter}
            onValueChange={(val) => setTypeFilter(val as TypeFilter)}
          >
            <SelectTrigger className="w-[160px]" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="auto">Auto</SelectItem>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="spend">Spend</SelectItem>
              <SelectItem value="transfer">Transfer</SelectItem>
              <SelectItem value="ignore">Ignore</SelectItem>
              <SelectItem value="no data">No Data</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Category Name</TableHead>
                <TableHead className="w-[25%]">Inferred Type</TableHead>
                <TableHead className="w-[35%]">Assigned Type</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCategories.map((category) => {
                const inferred = inferType(merged, category);
                const assigned = settingsMap.get(category);
                return (
                  <TableRow key={category}>
                    <TableCell className="font-medium">{category}</TableCell>
                    <TableCell>
                      <Badge variant={inferred.variant}>{inferred.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Select
                          value={assigned ?? 'auto'}
                          onValueChange={(val) =>
                            handleTypeChange(category, val as string)
                          }
                        >
                          <SelectTrigger size="sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">Auto</SelectItem>
                            <SelectItem value="income">Income</SelectItem>
                            <SelectItem value="spend">Spend</SelectItem>
                            <SelectItem value="transfer">Transfer</SelectItem>
                            <SelectItem value="ignore">Ignore</SelectItem>
                          </SelectContent>
                        </Select>
                        {!assigned && (
                          <span className="text-xs text-muted-foreground">
                            (inferred: {inferred.label})
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredCategories.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="py-6 text-center text-muted-foreground"
                  >
                    {search || typeFilter !== 'all'
                      ? 'No categories match your filters'
                      : 'No categories found'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function SettingsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h2 className="text-xl font-semibold">Settings</h2>
      <DataManagementSection />
      <CategoryTypeMappingSection />
    </div>
  );
}
