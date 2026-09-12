import { BaseLayout } from "@/components/layouts/base-layout"
import { Card, CardContent } from "@/components/ui/card"

export default function PlaceholderPage({
  title,
  description,
}: {
  title: string
  description?: string
}) {
  return (
    <BaseLayout title={title} description={description}>
      <div className="">
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center text-sm">
            The {title} screen lives here. Layout and content land next.
          </CardContent>
        </Card>
      </div>
    </BaseLayout>
  )
}
