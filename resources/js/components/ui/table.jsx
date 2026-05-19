import * as React from "react"

import { cn } from "@/lib/utils"

/** @type {React.ForwardRefRenderFunction<HTMLTableElement, React.TableHTMLAttributes<HTMLTableElement>>} */
const TableRender = ({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm", className)}
      {...props} />
  </div>
)
const Table = React.forwardRef(TableRender)
Table.displayName = "Table"

/** @type {React.ForwardRefRenderFunction<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>} */
const TableHeaderRender = ({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
)
const TableHeader = React.forwardRef(TableHeaderRender)
TableHeader.displayName = "TableHeader"

/** @type {React.ForwardRefRenderFunction<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>} */
const TableBodyRender = ({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props} />
)
const TableBody = React.forwardRef(TableBodyRender)
TableBody.displayName = "TableBody"

/** @type {React.ForwardRefRenderFunction<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>} */
const TableFooterRender = ({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
    {...props} />
)
const TableFooter = React.forwardRef(TableFooterRender)
TableFooter.displayName = "TableFooter"

/** @type {React.ForwardRefRenderFunction<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>} */
const TableRowRender = ({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
      className
    )}
    {...props} />
)
const TableRow = React.forwardRef(TableRowRender)
TableRow.displayName = "TableRow"

/** @type {React.ForwardRefRenderFunction<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>} */
const TableHeadRender = ({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props} />
)
const TableHead = React.forwardRef(TableHeadRender)
TableHead.displayName = "TableHead"

/** @type {React.ForwardRefRenderFunction<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>} */
const TableCellRender = ({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn(
      "p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
      className
    )}
    {...props} />
)
const TableCell = React.forwardRef(TableCellRender)
TableCell.displayName = "TableCell"

/** @type {React.ForwardRefRenderFunction<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>} */
const TableCaptionRender = ({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props} />
)
const TableCaption = React.forwardRef(TableCaptionRender)
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
