declare module 'lucide-react' {
  import type { FC, SVGProps } from 'react';

  interface IconProps extends SVGProps<SVGSVGElement> {
    size?: number | string;
    color?: string;
    strokeWidth?: number | string;
    className?: string;
  }

  type Icon = FC<IconProps>;

  export const Users: Icon;
  export const Clock: Icon;
  export const Activity: Icon;
  export const TrendingUp: Icon;
  export const BarChart3: Icon;
  export const Timer: Icon;
  export const UserCheck: Icon;
  export const AlertCircle: Icon;
  export const ChevronDown: Icon;
  export const ChevronUp: Icon;
  export const ChevronLeft: Icon;
  export const ChevronRight: Icon;
  export const Search: Icon;
  export const Settings: Icon;
  export const Menu: Icon;
  export const X: Icon;
  export const Check: Icon;
  export const Plus: Icon;
  export const Minus: Icon;
  export const Edit: Icon;
  export const Trash: Icon;
  export const Save: Icon;
  export const Download: Icon;
  export const Upload: Icon;
  export const Refresh: Icon;
  export const Info: Icon;
  export const Eye: Icon;
  export const EyeOff: Icon;
}
