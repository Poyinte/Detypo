import { useState, useEffect } from 'react'
import { UploadIcon, DownloadIcon } from "lucide-react"
import { NavMain } from "@/components/nav-main"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Settings2Icon, LanguagesIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useI18n } from '@/i18n'

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  onUpload: () => void
  onExport: () => void
  canExport: boolean
  apiKey: string
  keyOk: boolean
  keyStatus: string
  onValidateKey: (key: string) => void
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

export function AppSidebar({
  onUpload, onExport, canExport,
  apiKey, keyOk, keyStatus, onValidateKey,
  ...props
}: AppSidebarProps) {
  const { state } = useSidebar()
  const collapsed = state === 'collapsed'
  const { t, uiLang, setUiLang } = useI18n()
  const [draftKey, setDraftKey] = useState(apiKey)

  // Sync draft to saved key on popover close or validation failure
  useEffect(() => {
    if (keyStatus && keyStatus !== t('nav.validating') && !keyOk) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraftKey(apiKey)
    }
  }, [keyStatus, keyOk, apiKey])

  const navMain = [
    {
      title: t('nav.upload'),
      url: "#",
      icon: UploadIcon,
      onClick: onUpload,
    },
    {
      title: t('nav.export'),
      url: "#",
      icon: DownloadIcon,
      disabled: !canExport,
      onClick: onExport,
    },
  ]

  const navDocs = [
    {
      title: "GitHub",
      url: "https://github.com/Poyinte/Detypo",
      icon: GitHubIcon,
      onClick: () => window.open("https://github.com/Poyinte/Detypo", "_blank"),
    },
  ]

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center px-3" style={{ marginLeft: -1 }}>
              <div
                className="transition-all duration-300 shrink-0"
                style={{ width: collapsed ? 14 : 50, overflow: 'hidden' }}
              >
                <img
                  src="/logo.svg"
                  alt="得误 Detypo"
                  className="dark:invert shrink-0 max-w-none"
                  style={{ width: 50, height: 40, maxWidth: 'none' }}
                />
              </div>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
        <NavMain items={navDocs} groupLabel={t('nav.docs')} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          {/* Language toggle */}
          <SidebarMenuItem>
            <Popover>
              <PopoverTrigger asChild>
                <SidebarMenuButton tooltip={t('lang.ui_label')}>
                  <LanguagesIcon />
                  <span>{t('lang.ui_label')}</span>
                </SidebarMenuButton>
              </PopoverTrigger>
              <PopoverContent className="w-48" side="top" align="start" sideOffset={12}>
                <div className="flex flex-col gap-1">
                  {([
                    { code: 'zh' as const, label: '中文' },
                    { code: 'en' as const, label: 'English' },
                  ]).map(({ code, label }) => (
                    <Button
                      key={code}
                      variant={uiLang === code ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setUiLang(code)}
                      className="justify-start"
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </SidebarMenuItem>
          {/* API settings */}
          <SidebarMenuItem>
            <Popover onOpenChange={(open) => { if (open) setDraftKey(apiKey) }}>
              <PopoverTrigger asChild>
                <SidebarMenuButton tooltip={t('nav.api_settings')}>
                  <Settings2Icon />
                  <span>{t('nav.api_settings')}</span>
                </SidebarMenuButton>
              </PopoverTrigger>
              <PopoverContent className="w-80" side="top" align="start" sideOffset={12}>
                <PopoverHeader>
                  <PopoverTitle>{t('nav.api_title')}</PopoverTitle>
                </PopoverHeader>
                <div className="flex flex-col gap-3">
                  <Input
                    type="password" value={draftKey}
                    onChange={e => setDraftKey(e.target.value)}
                    placeholder="sk-"
                  />
                  <Button
                    onClick={() => onValidateKey(draftKey)}
                    size="sm"
                    disabled={keyStatus === t('nav.validating')}
                    variant={keyOk ? 'secondary' : keyStatus && !keyOk && keyStatus !== t('nav.validating') ? 'destructive' : 'outline'}
                    className={cn(keyOk && 'bg-emerald-600 hover:bg-emerald-700 text-white')}
                  >
                    {keyStatus === t('nav.validating') && <Spinner data-icon="inline-start" />}
                    {keyOk ? t('nav.validate_pass') : keyStatus && !keyOk && keyStatus !== t('nav.validating') ? t('nav.validate_fail') : t('nav.validate_btn')}
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
