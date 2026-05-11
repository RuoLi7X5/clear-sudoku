#!/bin/bash
cd /d/koishi-dev/mybot1/external/clear-sudoku
LOG="../images/jianku/batch-log.txt"
SCRIPT="scripts/gen-font-templates.ts"

log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG"; }

# Array of "prefix|path|name"
FONTS=(
  "simhei|C:/Windows/Fonts/simhei.ttf|SimHei"
  "kaiti|C:/Windows/Fonts/simkai.ttf|KaiTi"
  "fangsong|C:/Windows/Fonts/simfang.ttf|FangSong"
  "simsun|C:/Windows/Fonts/simsun.ttc|SimSun"
  "stkaiti|C:/Windows/Fonts/STKAITI.TTF|STKaiti"
  "stsong|C:/Windows/Fonts/STSONG.TTF|STSong"
  "stfangsong|C:/Windows/Fonts/STFANGSO.TTF|STFangsong"
  "stxihei|C:/Windows/Fonts/STXIHEI.TTF|STXihei"
  "stxingkai|C:/Windows/Fonts/STXINGKA.TTF|STXingkai"
  "stxinwei|C:/Windows/Fonts/STXINWEI.TTF|STXinwei"
  "stliti|C:/Windows/Fonts/STLITI.TTF|STLiti"
  "sthupo|C:/Windows/Fonts/STHUPO.TTF|STHupo"
  "stcaiyun|C:/Windows/Fonts/STCAIYUN.TTF|STCaiyun"
  "stzhongsong|C:/Windows/Fonts/STZHONGS.TTF|STZhongsong"
  "lisu|C:/Windows/Fonts/SIMLI.TTF|LiSu"
  "youyuan|C:/Windows/Fonts/SIMYOU.TTF|YouYuan"
  "fzshuti|C:/Windows/Fonts/FZSTK.TTF|FZShuTi"
  "fzyaoti|C:/Windows/Fonts/FZYTK.TTF|FZYaoTi"
  "hyzhonghei|C:/Windows/Fonts/HYZhongHeiTi-197.ttf|HYZhongHei"
  "harmonyos|C:/Windows/Fonts/HarmonyOS_Sans_SC_Regular.ttf|HarmonyOS SC"
  "misans|C:/Windows/Fonts/MiSans-Regular.ttf|MiSans"
  "pingfang|C:/Windows/Fonts/PingFang Medium.ttf|PingFang SC"
  "notosans|C:/Windows/Fonts/NotoSansSC-VF.ttf|Noto Sans SC"
  "notoserif|C:/Windows/Fonts/NotoSerifSC-VF.ttf|Noto Serif SC"
  "msjh|C:/Windows/Fonts/msjh.ttc|Microsoft JhengHei"
  "mingliu|C:/Windows/Fonts/mingliub.ttc|MingLiU"
  "simsunextg|C:/Windows/Fonts/SimsunExtG.ttf|SimSun ExtG"
  "dengxian|C:/Windows/Fonts/Deng.ttf|DengXian"
  "cour|C:/Windows/Fonts/cour.ttf|Courier New"
)

total=${#FONTS[@]}
START_TIME=$(date +%s)

for i in "${!FONTS[@]}"; do
  idx=$((i+1))
  IFS='|' read -r prefix path name <<< "${FONTS[$i]}"
  
  if [ ! -f "$path" ]; then
    log "[$idx/$total] SKIP $prefix: file not found"
    continue
  fi
  
  log "[$idx/$total] START $prefix ($name)"
  t0=$(date +%s)
  
  if npx ts-node "$SCRIPT" "$path" "$name" "$prefix" >> "$LOG" 2>&1; then
    t1=$(date +%s)
    dt=$((t1 - t0))
    elapsed=$((t1 - START_TIME))
    eta=$(( (elapsed * total / idx) - elapsed ))
    log "[$idx/$total] DONE $prefix in ${dt}s | elapsed: $((elapsed/60))m | ETA: $((eta/60))m"
  else
    log "[$idx/$total] FAIL $prefix"
  fi
done

log "=== ALL DONE ==="
