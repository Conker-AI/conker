import { Link } from "react-router-dom"
import { FileQuestion } from "lucide-react"
import { BaseLayout } from "@/components/layouts/base-layout"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
export default function NotFoundPage() {
  return (
    <BaseLayout title="Page not found">
      <div className="w-full">
        <Card className="shadow-none">
          <CardHeader>
            <FileQuestion className="mb-2 size-6 text-muted-foreground" />
            <CardTitle>This path isn’t in Conker</CardTitle>
            <CardDescription>
              Use the sidebar or command search to open an available screen.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild>
              <Link to="/">Back to Home</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </BaseLayout>
  )
}
