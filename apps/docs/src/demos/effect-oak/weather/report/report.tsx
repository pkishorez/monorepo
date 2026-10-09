import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@kstackz/web-platform/components/card';

type Weather = {
  readonly zipCode: string;
  readonly temperature: number;
  readonly description: string;
  readonly humidity: number;
  readonly windSpeed: number;
  readonly locationName: string;
  readonly region: string;
};

const Reading = ({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) => (
  <div className="rounded-md bg-muted p-3 text-center">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="font-semibold tabular-nums">{value}</div>
  </div>
);

/** One place's current weather, as a card. */
export const Report = ({ weather }: { readonly weather: Weather }) => (
  <Card>
    <CardHeader className="text-center">
      <CardTitle>{weather.zipCode}</CardTitle>
      <CardDescription>
        {[weather.locationName, weather.region].filter(Boolean).join(', ')}
      </CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-4">
      <div className="text-center">
        <div className="text-5xl font-semibold tabular-nums">
          {weather.temperature}°F
        </div>
        <div className="mt-1 text-muted-foreground">{weather.description}</div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Reading label="Humidity" value={`${weather.humidity}%`} />
        <Reading label="Wind" value={`${weather.windSpeed} mph`} />
      </div>
    </CardContent>
  </Card>
);
