import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { TrendingUp, MessageSquare, FileText, BarChart3, Shield, Zap } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary rounded-lg">
              <TrendingUp className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-white">Ask Finance</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost" className="text-white hover:text-white hover:bg-white/10">
                Log in
              </Button>
            </Link>
            <Link href="/signup">
              <Button className="bg-primary hover:bg-primary/90">
                Get Started
              </Button>
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-24 text-center">
        <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
          AI-Powered<br />Financial Intelligence
        </h1>
        <p className="text-xl text-slate-300 max-w-2xl mx-auto mb-10">
          Transform your financial data into actionable insights. Upload documents,
          ask questions, and get instant analysis with charts and reports.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/signup">
            <Button size="lg" className="w-full sm:w-auto">
              Start Free Trial
            </Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="outline" className="w-full sm:w-auto border-white/20 text-white hover:bg-white/10">
              View Demo
            </Button>
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-24">
        <h2 className="text-3xl font-bold text-white text-center mb-12">
          Everything you need for financial analysis
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <FeatureCard
            icon={MessageSquare}
            title="Conversational AI"
            description="Ask questions in natural language and get instant answers about your financial data."
          />
          <FeatureCard
            icon={FileText}
            title="Document Analysis"
            description="Upload PDFs, Excel files, and images. AI automatically extracts and indexes key information."
          />
          <FeatureCard
            icon={BarChart3}
            title="Dynamic Charts"
            description="Generate beautiful visualizations on-the-fly based on your queries."
          />
          <FeatureCard
            icon={Shield}
            title="Role-Based Access"
            description="Control who sees what with granular permissions for different business units."
          />
          <FeatureCard
            icon={Zap}
            title="Real-time Streaming"
            description="See responses as they're generated with live streaming technology."
          />
          <FeatureCard
            icon={TrendingUp}
            title="Financial Expertise"
            description="Built-in knowledge of P&L, variance analysis, ROI calculations, and more."
          />
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 py-24 text-center">
        <div className="bg-gradient-to-r from-primary/20 to-primary/10 rounded-3xl p-12">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to transform your financial analysis?
          </h2>
          <p className="text-slate-300 mb-8 max-w-xl mx-auto">
            Join thousands of finance professionals who trust Ask Finance
            for their daily analysis needs.
          </p>
          <Link href="/signup">
            <Button size="lg">Get Started Free</Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8">
        <div className="container mx-auto px-4 text-center text-slate-400 text-sm">
          <p>&copy; 2024 Ask Finance. Built with AI.</p>
        </div>
      </footer>
    </div>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType
  title: string
  description: string
}) {
  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10 hover:border-white/20 transition-colors">
      <div className="p-2 bg-primary/20 rounded-lg w-fit mb-4">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-slate-400 text-sm">{description}</p>
    </div>
  )
}
