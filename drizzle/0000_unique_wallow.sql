CREATE TYPE "public"."opportunity_status" AS ENUM('detected', 'executed', 'expired', 'skipped_risk', 'skipped_fees');--> statement-breakpoint
CREATE TYPE "public"."trade_mode" AS ENUM('paper', 'live');--> statement-breakpoint
CREATE TYPE "public"."trade_side" AS ENUM('buy', 'sell');--> statement-breakpoint
CREATE TYPE "public"."trade_status" AS ENUM('pending', 'filled', 'partial', 'failed');--> statement-breakpoint
CREATE TABLE "fee_cache" (
	"exchange" varchar(50) NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"maker_fee" numeric(10, 6) NOT NULL,
	"taker_fee" numeric(10, 6) NOT NULL,
	"cached_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"buy_exchange" varchar(50) NOT NULL,
	"sell_exchange" varchar(50) NOT NULL,
	"buy_price" numeric(18, 8) NOT NULL,
	"sell_price" numeric(18, 8) NOT NULL,
	"gross_spread_pct" numeric(10, 6) NOT NULL,
	"net_profit_pct" numeric(10, 6) NOT NULL,
	"estimated_amount" numeric(18, 8) NOT NULL,
	"status" "opportunity_status" DEFAULT 'detected' NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"opportunity_id" integer,
	"exchange" varchar(50) NOT NULL,
	"side" "trade_side" NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"amount" numeric(18, 8) NOT NULL,
	"price" numeric(18, 8) NOT NULL,
	"fee_paid" numeric(18, 8) NOT NULL,
	"fee_currency" varchar(10) NOT NULL,
	"order_id" varchar(100),
	"mode" "trade_mode" NOT NULL,
	"status" "trade_status" DEFAULT 'pending' NOT NULL,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opp_symbol_idx" ON "opportunities" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "opp_detected_at_idx" ON "opportunities" USING btree ("detected_at");--> statement-breakpoint
CREATE INDEX "trades_opportunity_idx" ON "trades" USING btree ("opportunity_id");--> statement-breakpoint
CREATE INDEX "trades_executed_at_idx" ON "trades" USING btree ("executed_at");