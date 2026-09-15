import * as React from "react"
import { ArrowUpRightIcon } from "@/components/ui/arrow-up-right"
import { BoxesIcon } from "@/components/ui/boxes"
import { CheckIcon } from "@/components/ui/check"
import { ChevronDownIcon } from "@/components/ui/chevron-down"
import { ChevronRightIcon } from "@/components/ui/chevron-right"
import { CircleHelpIcon } from "@/components/ui/circle-help"
import { ClockIcon } from "@/components/ui/clock"
import { CopyIcon } from "@/components/ui/copy"
import { DatabaseBackupIcon } from "@/components/ui/database-backup"
import { DownloadIcon } from "@/components/ui/download"
import { EarthIcon } from "@/components/ui/earth"
import { EyeIcon } from "@/components/ui/eye"
import { FileStackIcon } from "@/components/ui/file-stack"
import { FolderCodeIcon } from "@/components/ui/folder-code"
import { HardDriveDownloadIcon } from "@/components/ui/hard-drive-download"
import { KeyIcon } from "@/components/ui/key"
import { LayoutGridIcon } from "@/components/ui/layout-grid"
import { LayoutPanelTopIcon } from "@/components/ui/layout-panel-top"
import { Link2Icon } from "@/components/ui/link-2"
import { LoaderCircleIcon } from "@/components/ui/loader-circle"
import { Maximize2Icon } from "@/components/ui/maximize-2"
import { MenuIcon } from "@/components/ui/menu"
import { MinimizeIcon } from "@/components/ui/minimize"
import { MoonIcon } from "@/components/ui/moon"
import { PlayIcon } from "@/components/ui/play"
import { PlusIcon } from "@/components/ui/plus"
import { RefreshCWIcon } from "@/components/ui/refresh-cw"
import { RotateCCWIcon } from "@/components/ui/rotate-ccw"
import { SearchIcon } from "@/components/ui/search"
import { ServerIcon } from "@/components/ui/server"
import { ShieldCheckIcon } from "@/components/ui/shield-check"
import { SlidersHorizontalIcon } from "@/components/ui/sliders-horizontal"
import { SparklesIcon } from "@/components/ui/sparkles"
import { SunIcon } from "@/components/ui/sun"
import { TerminalIcon } from "@/components/ui/terminal"
import { UploadIcon } from "@/components/ui/upload"
import { WaypointsIcon } from "@/components/ui/waypoints"
import { XIcon } from "@/components/ui/x"
import { cn } from "@/lib/utils"

type AnimatedIconProps = React.HTMLAttributes<HTMLDivElement> & { size?: number }
function withIconDefaults(Icon: React.ElementType) {
  function AnimatedIcon({ className, size = 16, ...props }: AnimatedIconProps) {
    return <Icon aria-hidden="true" size={size} className={cn("inline-flex size-4 shrink-0 items-center justify-center [&_svg]:!size-full", className)} {...props} />
  }
  AnimatedIcon.displayName = "AnimatedIcon"
  return AnimatedIcon
}

const ArrowUpRight = withIconDefaults(ArrowUpRightIcon)
const Boxes = withIconDefaults(BoxesIcon)
const Check = withIconDefaults(CheckIcon)
const ChevronDown = withIconDefaults(ChevronDownIcon)
const ChevronRight = withIconDefaults(ChevronRightIcon)
const CircleHelp = withIconDefaults(CircleHelpIcon)
const Clock3 = withIconDefaults(ClockIcon)
const Copy = withIconDefaults(CopyIcon)
const Database = withIconDefaults(BoxesIcon)
const DatabaseZap = withIconDefaults(DatabaseBackupIcon)
const Download = withIconDefaults(DownloadIcon)
const FileCode2 = withIconDefaults(FolderCodeIcon)
const FileStack = withIconDefaults(FileStackIcon)
const Filter = withIconDefaults(SlidersHorizontalIcon)
const Focus = withIconDefaults(Maximize2Icon)
const Globe2 = withIconDefaults(EarthIcon)
const HardDrive = withIconDefaults(HardDriveDownloadIcon)
const Eye = withIconDefaults(EyeIcon)
const KeyRound = withIconDefaults(KeyIcon)
const LayoutGrid = withIconDefaults(LayoutGridIcon)
const Link2 = withIconDefaults(Link2Icon)
const LoaderCircle = withIconDefaults(LoaderCircleIcon)
const Minus = withIconDefaults(MinimizeIcon)
const Moon = withIconDefaults(MoonIcon)
const MoreHorizontal = withIconDefaults(MenuIcon)
const Play = withIconDefaults(PlayIcon)
const Plus = withIconDefaults(PlusIcon)
const RefreshCw = withIconDefaults(RefreshCWIcon)
const RotateCcw = withIconDefaults(RotateCCWIcon)
const Rows3 = withIconDefaults(LayoutPanelTopIcon)
const Search = withIconDefaults(SearchIcon)
const Server = withIconDefaults(ServerIcon)
const Share2 = withIconDefaults(UploadIcon)
const ShieldCheck = withIconDefaults(ShieldCheckIcon)
const Sparkles = withIconDefaults(SparklesIcon)
const Sun = withIconDefaults(SunIcon)
const Table2 = withIconDefaults(LayoutPanelTopIcon)
const TableProperties = withIconDefaults(LayoutPanelTopIcon)
const Braces = withIconDefaults(TerminalIcon)
const Waypoints = withIconDefaults(WaypointsIcon)
const X = withIconDefaults(XIcon)

export {
  ArrowUpRight,
  Boxes,
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Copy,
  Database,
  DatabaseZap,
  Download,
  Eye,
  FileCode2,
  FileStack,
  Filter,
  Focus,
  Globe2,
  HardDrive,
  KeyRound,
  LayoutGrid,
  Link2,
  LoaderCircle,
  Minus,
  Moon,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Rows3,
  Search,
  Server,
  Share2,
  ShieldCheck,
  Sparkles,
  Sun,
  Table2,
  TableProperties,
  Waypoints,
  X,
}
