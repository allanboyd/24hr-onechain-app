// docs/14 (workstream B) endpoints: warehouse expenses and inventory, re-export orders, selling prices, transport fees and
// the combined performance report. Access is enforced in MoneyService with the shared rules (@btw/api/money).
import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { Me } from '../auth/decorators';
import type { Principal } from '../auth/principal';
import { once } from '../common/idempotency';
import { MoneyService } from '../domain/money.service';
import type { PerfFilter, PerfLevel } from '@btw/api/performance';
import type { CashOpeningInput, CashTransferInput, ReexportInput, ReexportLoadInput, SellingPriceInput, StockAdjustInput, SupplierEntryInput, WarehouseExpenseInput } from '@btw/api/types';

type Idem = string | undefined;
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
const LEVELS: PerfLevel[] = ['product', 'warehouse', 'company', 'receiving', 'business'];

@Controller('warehouse')
export class WarehouseController {
  constructor(private money: MoneyService) {}
  /** V3-12 step 4: warehouse cash (cash at start; cash sent to the company account). */
  @Get('cash') cash(@Me() p: Principal) { return this.money.cashOverview(p); }
  @Put('cash/opening') setOpening(@Me() p: Principal, @Body() b: CashOpeningInput) { return this.money.setOpening(p, b ?? ({} as CashOpeningInput)); }
  @Post('cash/transfers') @HttpCode(200) sendCash(@Me() p: Principal, @Body() b: CashTransferInput, @Headers('idempotency-key') k: Idem) { return once(k, p.id, 'cash.send', () => this.money.sendCash(p, b ?? ({} as CashTransferInput))).then((r) => r.result); }
  @Get('expenses') expenses(@Me() p: Principal, @Query() q: Record<string, unknown>) { return this.money.expenses(p, { warehouseId: str(q?.warehouseId), from: str(q?.from), to: str(q?.to), category: str(q?.category) }); }
  @Post('expenses') addExpense(@Me() p: Principal, @Body() b: WarehouseExpenseInput) { return this.money.addExpense(p, b ?? ({} as WarehouseExpenseInput)); }
  @Patch('expenses/:id') updateExpense(@Me() p: Principal, @Param('id') id: string, @Body() b: Partial<WarehouseExpenseInput>) { return this.money.updateExpense(p, id, b ?? {}); }
  @Delete('expenses/:id') @HttpCode(204) async deleteExpense(@Me() p: Principal, @Param('id') id: string) { await this.money.deleteExpense(p, id); }
  @Get('stock') stock(@Me() p: Principal, @Query() q: Record<string, unknown>) { return this.money.stock(p, { warehouseId: str(q?.warehouseId), from: str(q?.from), to: str(q?.to) }); }
  @Get('stock-adjustments') adjustments(@Me() p: Principal, @Query('warehouseId') w?: string) { return this.money.adjustments(p, { warehouseId: str(w) }); }
  @Post('stock-adjustments') adjust(@Me() p: Principal, @Body() b: StockAdjustInput, @Headers('idempotency-key') k: Idem) { return once(k, p.id, 'stock.adjust', () => this.money.adjust(p, b ?? ({} as StockAdjustInput))).then((r) => r.result); }
}

@Controller('reexports')
export class ReexportsController {
  constructor(private money: MoneyService) {}
  @Get() list(@Me() p: Principal) { return this.money.listReexports(p); }
  @Post() create(@Me() p: Principal, @Body() b: ReexportInput, @Headers('idempotency-key') k: Idem) { return once(k, p.id, 'reexport.create', () => this.money.createReexport(p, b ?? ({} as ReexportInput))).then((r) => r.result); }
  @Get(':id') get(@Me() p: Principal, @Param('id') id: string) { return this.money.getReexport(p, id); }
  @Post(':id/load') @HttpCode(200) load(@Me() p: Principal, @Param('id') id: string, @Body() b: ReexportLoadInput, @Headers('idempotency-key') k: Idem) { return once(k, p.id, 'reexport.load', () => this.money.loadReexport(p, id, b ?? {})).then((r) => r.result); }
  @Post(':id/cancel') @HttpCode(200) cancel(@Me() p: Principal, @Param('id') id: string, @Body() b: { reason?: string }) { return this.money.cancelReexport(p, id, b?.reason); }
}

@Controller()
export class MoneyController {
  constructor(private money: MoneyService) {}
  /** V3-12 step 3: supplier money on a PO (pro-forma, advance, credit note) and a director's decision on a waiting advance. */
  @Get('pos/:id/supplier-money') supplierMoney(@Me() p: Principal, @Param('id') id: string) { return this.money.supplierMoney(p, id); }
  @Post('pos/:id/supplier-money') @HttpCode(200) recordSupplierMoney(@Me() p: Principal, @Param('id') id: string, @Body() b: SupplierEntryInput, @Headers('idempotency-key') k: Idem) { return once(k, p.id, 'supplier.money', () => this.money.recordSupplierMoney(p, id, b ?? ({} as SupplierEntryInput))).then((r) => r.result); }
  @Post('supplier-entries/:id/decision') @HttpCode(200) decideSupplierEntry(@Me() p: Principal, @Param('id') id: string, @Body() b: { approve?: boolean }) { return this.money.decideSupplierEntry(p, id, b?.approve === true); }
  @Get('supplier-entries') supplierEntries(@Me() p: Principal) { return this.money.supplierEntries(p); }
  @Get('selling-prices') prices(@Me() p: Principal) { return this.money.prices(p); }
  @Post('selling-prices') setPrice(@Me() p: Principal, @Body() b: SellingPriceInput) { return this.money.setPrice(p, b ?? ({} as SellingPriceInput)); }
  @Get('finance/fees') fees(@Me() p: Principal) { return this.money.fees(p); }
  @Get('reports/performance') performance(@Me() p: Principal, @Query() q: Record<string, unknown>) {
    const ok = (x?: string) => (x && !Number.isNaN(Date.parse(x)) ? new Date(x).toISOString() : undefined);
    const tm = Number(q?.targetMargin);
    const f: PerfFilter = {
      from: ok(str(q?.from)), to: ok(str(q?.to)), warehouseId: str(q?.warehouseId), productId: str(q?.productId), entityId: str(q?.entityId), receivingCompanyId: str(q?.receivingCompanyId),
      level: LEVELS.includes(q?.level as PerfLevel) ? (q.level as PerfLevel) : undefined, targetMargin: Number.isFinite(tm) && q?.targetMargin !== undefined ? tm : undefined,
    };
    return this.money.performance(p, f);
  }
}
