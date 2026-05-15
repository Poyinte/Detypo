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
import { Settings2Icon } from "lucide-react"
import { cn } from "@/lib/utils"

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  onUpload: () => void
  onExport: () => void
  canExport: boolean
  apiKey: string
  keyOk: boolean
  keyStatus: string
  onValidateKey: (key: string) => void
}

export function AppSidebar({
  onUpload, onExport, canExport,
  apiKey, keyOk, keyStatus, onValidateKey,
  ...props
}: AppSidebarProps) {
  const { state } = useSidebar()
  const collapsed = state === 'collapsed'
  const [draftKey, setDraftKey] = useState(apiKey)

  // Sync draft to saved key on popover close or validation failure
  useEffect(() => {
    if (keyStatus && keyStatus !== '验证中...' && !keyOk) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraftKey(apiKey)
    }
  }, [keyStatus, keyOk, apiKey])

  const navMain = [
    {
      title: "上传 PDF",
      url: "#",
      icon: UploadIcon,
      onClick: onUpload,
    },
    {
      title: "导出 PDF",
      url: "#",
      icon: DownloadIcon,
      disabled: !canExport,
      onClick: onExport,
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
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <Popover onOpenChange={(open) => { if (open) setDraftKey(apiKey) }}>
              <PopoverTrigger asChild>
                <SidebarMenuButton tooltip="API 设置">
                  <Settings2Icon />
                  <span>API 设置</span>
                </SidebarMenuButton>
              </PopoverTrigger>
              <PopoverContent className="w-80" side="top" align="start" sideOffset={12}>
                <PopoverHeader>
                  <PopoverTitle>API 设置</PopoverTitle>
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
                    disabled={keyStatus === '验证中...'}
                    variant={keyOk ? 'secondary' : keyStatus && !keyOk && keyStatus !== '验证中...' ? 'destructive' : 'outline'}
                    className={cn(keyOk && 'bg-emerald-600 hover:bg-emerald-700 text-white')}
                  >
                    {keyStatus === '验证中...' && <Spinner data-icon="inline-start" />}
                    {keyOk ? '验证通过' : keyStatus && !keyOk && keyStatus !== '验证中...' ? 'API Key 无效' : '验证并保存'}
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
