/**
 * 批量生成 P0 中文字体模板
 */
import { execSync } from "child_process";
import { join } from "path";
import { existsSync, mkdirSync, writeFileSync } from "fs";

const FONTS_DIR = "C:/Windows/Fonts";
const SCRIPT = join(__dirname, "gen-font-templates.ts");

interface FontEntry {
  file: string;
  name: string;
  prefix: string;
}

// P0: 中文字体（37个）
const FONTS: FontEntry[] = [
  { file: "simhei.ttf", name: "SimHei", prefix: "simhei" },
  { file: "simkai.ttf", name: "KaiTi", prefix: "kaiti" },
  { file: "simfang.ttf", name: "FangSong", prefix: "fangsong" },
  { file: "simsun.ttc", name: "SimSun", prefix: "simsun" },
  { file: "STKAITI.TTF", name: "STKaiti", prefix: "stkaiti" },
  { file: "STSONG.TTF", name: "STSong", prefix: "stsong" },
  { file: "STFANGSO.TTF", name: "STFangsong", prefix: "stfangsong" },
  { file: "STXIHEI.TTF", name: "STXihei", prefix: "stxihei" },
  { file: "STXINGKA.TTF", name: "STXingkai", prefix: "stxingkai" },
  { file: "STXINWEI.TTF", name: "STXinwei", prefix: "stxinwei" },
  { file: "STLITI.TTF", name: "STLiti", prefix: "stliti" },
  { file: "STHUPO.TTF", name: "STHupo", prefix: "sthupo" },
  { file: "STCAIYUN.TTF", name: "STCaiyun", prefix: "stcaiyun" },
  { file: "STZHONGS.TTF", name: "STZhongsong", prefix: "stzhongsong" },
  { file: "SIMLI.TTF", name: "LiSu", prefix: "lisu" },
  { file: "SIMYOU.TTF", name: "YouYuan", prefix: "youyuan" },
  { file: "FZSTK.TTF", name: "FZShuTi", prefix: "fzshuti" },
  { file: "FZYTK.TTF", name: "FZYaoTi", prefix: "fzyaoti" },
  { file: "HYZhongHeiTi-197.ttf", name: "HYZhongHei", prefix: "hyzhonghei" },
  { file: "HarmonyOS_Sans_SC_Regular.ttf", name: "HarmonyOS SC", prefix: "harmonyos" },
  { file: "MiSans-Regular.ttf", name: "MiSans", prefix: "misans" },
  { file: "PingFang Medium.ttf", name: "PingFang SC", prefix: "pingfang" },
  { file: "NotoSansSC-VF.ttf", name: "Noto Sans SC", prefix: "notosans" },
  { file: "NotoSerifSC-VF.ttf", name: "Noto Serif SC", prefix: "notoserif" },
  { file: "SourceHanSansCN-Normal.ttf", name: "Source Han Sans CN", prefix: "sourcehansans" },
  { file: "msjh.ttc", name: "Microsoft JhengHei", prefix: "msjh" },
  { file: "mingliub.ttc", name: "MingLiU", prefix: "mingliu" },
  { file: "SimsunExtG.ttf", name: "SimSun ExtG", prefix: "simsunextg" },
  { file: "YuGothR.ttc", name: "Yu Gothic", prefix: "yugothic" },
  { file: "malgun.ttf", name: "Malgun Gothic", prefix: "malgun" },
  { file: "msyi.ttf", name: "Microsoft Yi Baiti", prefix: "msyi" },
  { file: "micross.ttf", name: "Microsoft Sans Serif", prefix: "micross" },
  { file: "mmrtext.ttf", name: "Myanmar Text", prefix: "mmrtext" },
  { file: "msgothic.ttc", name: "MS Gothic", prefix: "msgothic" },
  { file: "Deng.ttf", name: "DengXian", prefix: "dengxian" },
  { file: "l_10646.ttf", name: "Lucida Sans Unicode", prefix: "lucidasans" },
  { file: "cour.ttf", name: "Courier New", prefix: "courier" }, // extra
];

const LOG_FILE = join(__dirname, "..", "..", "..", "images", "jianku", "batch-log.txt");

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  writeFileSync(LOG_FILE, line + "\n", { flag: "a" });
}

async function main() {
  mkdirSync(join(__dirname, "..", "..", "..", "images", "jianku"), { recursive: true });
  writeFileSync(LOG_FILE, ""); // clear log

  let completed = 0, failed = 0;
  const startTime = Date.now();

  for (let i = 0; i < FONTS.length; i++) {
    const f = FONTS[i];
    const fontPath = join(FONTS_DIR, f.file);

    if (!existsSync(fontPath)) {
      log(`[${i + 1}/${FONTS.length}] SKIP ${f.prefix}: 文件不存在 ${fontPath}`);
      continue;
    }

    log(`[${i + 1}/${FONTS.length}] START ${f.prefix} (${f.name})`);

    try {
      const cmd = `npx ts-node "${SCRIPT}" "${fontPath}" "${f.name}" "${f.prefix}"`;
      execSync(cmd, {
        cwd: join(__dirname, ".."),
        stdio: "pipe",
        timeout: 300_000, // 5 min per font
      });
      completed++;
      log(`[${i + 1}/${FONTS.length}] DONE ${f.prefix} ✓`);

      // Estimate remaining time
      const elapsed = (Date.now() - startTime) / 1000;
      const perFont = elapsed / (i + 1);
      const remaining = perFont * (FONTS.length - i - 1);
      log(`  Progress: ${completed} ok, ${failed} fail | ETA: ${Math.round(remaining / 60)}min`);
    } catch (e: any) {
      failed++;
      log(`[${i + 1}/${FONTS.length}] FAIL ${f.prefix}: ${e.stderr?.toString().slice(0, 200) || e.message}`);
    }
  }

  log(`\n=== BATCH COMPLETE ===`);
  log(`Completed: ${completed}, Failed: ${failed}, Total: ${FONTS.length}`);
  log(`Total time: ${Math.round((Date.now() - startTime) / 60000)}min`);
}

main().catch(console.error);
