"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import confetti from "canvas-confetti";
import { Play, Pause, RotateCcw, X, Trophy } from "lucide-react";

// 블록 색상 정의 (6개 파스텔 색상)
const COLORS = {
  LIGHT_RED: "#f87171",    // 연한 빨강
  LIGHT_ORANGE: "#fb923c", // 연한 주황
  LIGHT_YELLOW: "#fde047", // 연한 노랑
  LIGHT_GREEN: "#86efac",  // 연한 녹색
  LIGHT_BLUE: "#7dd3fc",   // 연한 파랑
  LIGHT_PURPLE: "#c084fc", // 연한 보라
};

const OTHER_COLORS = [
  COLORS.LIGHT_ORANGE,
  COLORS.LIGHT_YELLOW,
  COLORS.LIGHT_GREEN,
  COLORS.LIGHT_BLUE,
  COLORS.LIGHT_PURPLE,
];

interface Brick {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  isTargetRed: boolean;
  broken: boolean;
}

interface RankItem {
  name: string;
  finishtime: string;
}

export default function Home() {
  const [gameState, setGameState] = useState<"start" | "ready" | "playing" | "paused" | "gameover" | "cleared">("start");
  const [userName, setUserName] = useState("");
  const [lives, setLives] = useState(3);
  const [redBrokenCount, setRedBrokenCount] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);

  // 시간 측정 (초 단위)
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [clearedTimeText, setClearedTimeText] = useState("");

  // Top 3 랭킹 데이터
  const [top3, setTop3] = useState<RankItem[]>([]);
  const [isSavingRank, setIsSavingRank] = useState(false);

  // 제작자 정보
  const creatorInfo = {
    dept: "경영학부",
    studentId: "202501617",
    name: "최인홍",
  };

  // 캔버스 및 오디오 참조
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const touchStartXRef = useRef<number | null>(null);

  // 게임 물리 상태
  const gameRef = useRef({
    paddleX: 195,
    paddleW: 90,
    paddleH: 12,
    ballX: 240,
    ballY: 380,
    ballRadius: 7,
    dx: 3.5,
    dy: -3.5,
    leftPressed: false,
    rightPressed: false,
    bricks: [] as Brick[],
    animationFrameId: 0,
    lives: 3,
    redBrokenCount: 0,
  });

  // 분:초 포맷 (mm:ss 형태)
  const formatTimeDigital = (totalSec: number) => {
    const m = Math.floor(totalSec / 60);
    const s = Math.floor(totalSec % 60);
    return `${m < 10 ? "0" + m : m}:${s < 10 ? "0" + s : s}`;
  };

  // 구글 시트에서 Top 3 가져오기
  const fetchTop3 = async () => {
    const url = process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL;
    if (!url) return;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (data && data.top3) {
        setTop3(data.top3);
      }
    } catch {
      // API 조회 실패 시
    }
  };

  useEffect(() => {
    fetchTop3();
  }, []);

  // 구글 시트에 기록 저장하기
  const saveToGoogleSheet = async (player: string, finish: string) => {
    const url = process.env.NEXT_PUBLIC_GOOGLE_SCRIPT_URL;
    if (!url) return;
    setIsSavingRank(true);
    try {
      await fetch(url, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: player,
          finishtime: finish,
        }),
      });
      setTimeout(() => {
        fetchTop3();
        setIsSavingRank(false);
      }, 1200);
    } catch {
      setIsSavingRank(false);
    }
  };

  const playHitSound = () => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(500, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.07);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.07);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.07);
    } catch {}
  };

  const triggerConfetti = () => {
    const end = Date.now() + 3 * 1000;
    (function frame() {
      confetti({ particleCount: 4, angle: 60, spread: 55, origin: { x: 0 } });
      confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1 } });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  };

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (gameState === "playing") {
      interval = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [gameState]);

  const initBricks = () => {
    const rows = 5;
    const cols = 8;
    const total = rows * cols;
    const redCount = Math.round(total * 0.3); // 12개 (30%)

    const colorPool: { color: string; isRed: boolean }[] = [];
    for (let i = 0; i < redCount; i++) colorPool.push({ color: COLORS.LIGHT_RED, isRed: true });
    for (let i = 0; i < total - redCount; i++) {
      const randColor = OTHER_COLORS[Math.floor(Math.random() * OTHER_COLORS.length)];
      colorPool.push({ color: randColor, isRed: false });
    }

    for (let i = colorPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [colorPool[i], colorPool[j]] = [colorPool[j], colorPool[i]];
    }

    const bricks: Brick[] = [];
    const brickW = 46;
    const brickH = 16;
    const padding = 6;
    const offsetTop = 25;
    const offsetLeft = 15;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const item = colorPool[r * cols + c];
        bricks.push({
          x: c * (brickW + padding) + offsetLeft,
          y: r * (brickH + padding) + offsetTop,
          w: brickW,
          h: brickH,
          color: item.color,
          isTargetRed: item.isRed,
          broken: false,
        });
      }
    }
    return bricks;
  };

  // 게임판 초기화 및 즉시 재시작
  const resetAndStartGame = () => {
    setLives(3);
    setRedBrokenCount(0);
    setElapsedSeconds(0);
    setClearedTimeText("");

    gameRef.current.lives = 3;
    gameRef.current.redBrokenCount = 0;
    gameRef.current.bricks = initBricks();
    gameRef.current.paddleX = (440 - gameRef.current.paddleW) / 2;
    gameRef.current.ballX = 220;
    gameRef.current.ballY = 380;
    gameRef.current.dx = 3.5 * (Math.random() > 0.5 ? 1 : -1);
    gameRef.current.dy = -3.5;

    if (bgmRef.current) {
      bgmRef.current.volume = 0.25;
      bgmRef.current.currentTime = 0;
      bgmRef.current.play().catch(() => {});
    }

    setGameState("ready");
    setCountdown(3);

    let currentCount = 3;
    const timer = setInterval(() => {
      currentCount -= 1;
      if (currentCount > 0) {
        setCountdown(currentCount);
      } else {
        clearInterval(timer);
        setCountdown(null);
        setGameState("playing");
      }
    }, 1000);
  };

  const handleStartGame = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim()) {
      alert("사용자 이름을 입력해주세요!");
      return;
    }
    resetAndStartGame();
  };

  const handleTogglePause = () => {
    if (gameState === "playing") {
      setGameState("paused");
      if (bgmRef.current) bgmRef.current.pause();
    } else if (gameState === "paused") {
      setGameState("playing");
      if (bgmRef.current) bgmRef.current.play().catch(() => {});
    }
  };

  // 다시 시작 (즉시 재시작)
  const handleRestart = () => {
    resetAndStartGame();
  };

  // 게임 종료 (첫 화면 이동)
  const handleQuitGame = () => {
    if (bgmRef.current) {
      bgmRef.current.pause();
      bgmRef.current.currentTime = 0;
    }
    fetchTop3();
    setGameState("start");
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") gameRef.current.leftPressed = true;
      if (e.key === "ArrowRight") gameRef.current.rightPressed = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") gameRef.current.leftPressed = false;
      if (e.key === "ArrowRight") gameRef.current.rightPressed = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    touchStartXRef.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (touchStartXRef.current === null) return;
    const currentX = e.touches[0].clientX;
    const diffX = currentX - touchStartXRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scale = canvas.width / canvas.getBoundingClientRect().width;
    const moveAmount = diffX * scale;
    const g = gameRef.current;
    g.paddleX = Math.max(0, Math.min(canvas.width - g.paddleW, g.paddleX + moveAmount));
    touchStartXRef.current = currentX;
  };

  const handleTouchEnd = () => {
    touchStartXRef.current = null;
  };

  useEffect(() => {
    if (gameState !== "playing" && gameState !== "ready" && gameState !== "paused") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const render = () => {
      const g = gameRef.current;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 벽돌 그리기
      g.bricks.forEach((b) => {
        if (!b.broken) {
          ctx.beginPath();
          ctx.roundRect(b.x, b.y, b.w, b.h, 2);
          ctx.fillStyle = b.color;
          ctx.fill();
          ctx.closePath();
        }
      });

      // 패들 그리기
      ctx.beginPath();
      ctx.roundRect(g.paddleX, canvas.height - 22, g.paddleW, g.paddleH, 6);
      ctx.fillStyle = "#3b82f6";
      ctx.fill();
      ctx.closePath();

      // 공 그리기
      ctx.beginPath();
      ctx.arc(g.ballX, g.ballY, g.ballRadius, 0, Math.PI * 2);
      ctx.fillStyle = "#f43f5e";
      ctx.fill();
      ctx.closePath();

      if (gameState === "ready" || gameState === "paused") {
        g.animationFrameId = requestAnimationFrame(render);
        return;
      }

      // PC 키보드 패들 이동
      if (g.leftPressed && g.paddleX > 0) g.paddleX -= 6;
      if (g.rightPressed && g.paddleX < canvas.width - g.paddleW) g.paddleX += 6;

      // 공 이동
      g.ballX += g.dx;
      g.ballY += g.dy;

      // 좌우 충돌
      if (g.ballX + g.ballRadius > canvas.width) {
        g.ballX = canvas.width - g.ballRadius;
        g.dx = -Math.abs(g.dx);
        playHitSound();
      } else if (g.ballX - g.ballRadius < 0) {
        g.ballX = g.ballRadius;
        g.dx = Math.abs(g.dx);
        playHitSound();
      }

      // 상단 충돌
      if (g.ballY - g.ballRadius < 0) {
        g.ballY = g.ballRadius;
        g.dy = Math.abs(g.dy);
        playHitSound();
      }

      // 벽돌 충돌
      for (let i = 0; i < g.bricks.length; i++) {
        const b = g.bricks[i];
        if (!b.broken) {
          if (
            g.ballX + g.ballRadius > b.x &&
            g.ballX - g.ballRadius < b.x + b.w &&
            g.ballY + g.ballRadius > b.y &&
            g.ballY - g.ballRadius < b.y + b.h
          ) {
            b.broken = true;
            g.dy = -g.dy;
            playHitSound();

            if (b.isTargetRed) {
              g.redBrokenCount += 1;
              setRedBrokenCount(g.redBrokenCount);

              if (g.redBrokenCount >= 3) {
                if (bgmRef.current) bgmRef.current.pause();
                const finishText = formatTimeDigital(elapsedSeconds);
                setClearedTimeText(finishText);
                setGameState("cleared");
                triggerConfetti();

                saveToGoogleSheet(userName, finishText);
                return;
              }
            }
            break;
          }
        }
      }

      // 패들 충돌
      const paddleTop = canvas.height - 22;
      if (
        g.ballY + g.ballRadius >= paddleTop &&
        g.ballY - g.ballRadius <= paddleTop + g.paddleH &&
        g.ballX >= g.paddleX &&
        g.ballX <= g.paddleX + g.paddleW &&
        g.dy > 0
      ) {
        playHitSound();
        const hitPoint = (g.ballX - (g.paddleX + g.paddleW / 2)) / (g.paddleW / 2);
        const speed = 5.2;
        g.dx = hitPoint * (speed * 0.85);
        g.dy = -Math.sqrt(Math.max(speed * speed - g.dx * g.dx, 4));
      }

      // 하단 낙하
      if (g.ballY - g.ballRadius > canvas.height) {
        g.lives -= 1;
        setLives(g.lives);

        if (g.lives <= 0) {
          if (bgmRef.current) bgmRef.current.pause();
          setGameState("gameover");
          return;
        } else {
          g.ballX = canvas.width / 2;
          g.ballY = canvas.height - 70;
          g.paddleX = (canvas.width - g.paddleW) / 2;
          g.dx = 3.5 * (Math.random() > 0.5 ? 1 : -1);
          g.dy = -3.5;
        }
      }

      g.animationFrameId = requestAnimationFrame(render);
    };

    gameRef.current.animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(gameRef.current.animationFrameId);
  }, [gameState, elapsedSeconds]);

  return (
    <div className="min-h-screen bg-[#0d0f17] text-white flex flex-col items-center justify-center p-3 selection:bg-rose-500 selection:text-white font-sans">
      <audio ref={bgmRef} src="/Hyper_Speed_Run.mp3" loop preload="auto" />

      {/* 메인 콘솔 박스 */}
      <div className="w-full max-w-[480px] bg-[#161922] border border-slate-800/80 rounded-3xl p-5 sm:p-6 shadow-2xl relative flex flex-col items-center">
        {gameState === "start" ? (
          // 시작 화면
          <div className="w-full flex flex-col items-center py-2">
            
            {/* 마스코트 이미지 (원래 크기 w-28 h-28 유지) 및 오른쪽 제작자 정보 */}
            <div className="w-full flex items-center justify-center gap-5 mb-5 bg-[#1e2230]/80 border border-slate-700/60 p-4 rounded-2xl">
              {/* 마스코트 원래 크기 */}
              <div className="relative w-28 h-28 rounded-2xl overflow-hidden bg-white p-2 shadow-md shrink-0">
                <Image
                  src="/Mascot.jpg"
                  alt="마스코트 횃불이"
                  fill
                  className="object-contain"
                  priority
                />
              </div>

              {/* 사진 오른쪽 제작자 정보 */}
              <div className="flex flex-col justify-center text-left text-sm gap-1.5">
                <div className="text-[11px] font-bold text-blue-400 tracking-wider">제작자 프로필</div>
                <div className="text-slate-200">
                  <span className="text-slate-400 text-xs mr-1.5">학과:</span>
                  <span className="font-semibold text-white">{creatorInfo.dept}</span>
                </div>
                <div className="text-slate-200">
                  <span className="text-slate-400 text-xs mr-1.5">학번:</span>
                  <span className="font-semibold text-white">{creatorInfo.studentId}</span>
                </div>
                <div className="text-slate-200">
                  <span className="text-slate-400 text-xs mr-1.5">이름:</span>
                  <span className="font-semibold text-white">{creatorInfo.name}</span>
                </div>
              </div>
            </div>

            <h1 className="text-2xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300 mb-0.5">
              INU 벽돌깨기
            </h1>
            <p className="text-xs text-slate-400 mb-4">
              부서진 빨간 벽돌 3개를 찾으세요!
            </p>

            {/* 입력 폼 */}
            <form onSubmit={handleStartGame} className="w-full flex flex-col gap-2.5 mb-4">
              <input
                type="text"
                placeholder="이름을 입력하세요"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="w-full py-3 px-4 rounded-xl bg-[#232736] border border-slate-700 focus:outline-none focus:border-blue-500 text-white placeholder-slate-400 text-center font-medium text-sm transition-colors"
                autoFocus
              />

              <button
                type="submit"
                className="w-full py-3 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-all duration-150 cursor-pointer shadow-lg shadow-blue-600/30 active:scale-[0.99] flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4 fill-white" /> 게임 시작
              </button>
            </form>

            {/* 실시간 구글 시트 연동 Top 3 랭킹 카드 */}
            <div className="w-full bg-[#1c202d] border border-slate-700/60 rounded-2xl p-3">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" /> 명예의 전당 (Top 3)
                </span>
                <span className="text-[10px] text-slate-400">구글 시트 실시간 연동</span>
              </div>
              <div className="flex flex-col gap-1.5">
                {top3.length > 0 ? (
                  top3.slice(0, 3).map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-[#151824] px-3 py-1.5 rounded-lg text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-4 text-center font-bold ${
                          idx === 0 ? "text-amber-400" : idx === 1 ? "text-slate-300" : "text-amber-600"
                        }`}>
                          {idx + 1}
                        </span>
                        <span className="text-slate-200 font-medium">{item.name}</span>
                      </div>
                      <span className="font-mono text-rose-400 font-semibold">{item.finishtime}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-2 text-xs text-slate-400">
                    아직 등록된 랭킹 기록이 없습니다.
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          // 게임 플레이 화면
          <div className="w-full flex flex-col items-center">
            {/* 상단 스탯 바 */}
            <div className="w-full flex items-center justify-between px-1 mb-4">
              <div className="flex items-center gap-4 sm:gap-6 text-left">
                {/* LIVES */}
                <div>
                  <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">LIVES</div>
                  <div className="flex items-center gap-0.5 text-rose-500 text-sm mt-0.5">
                    {"❤️".repeat(lives)}
                  </div>
                </div>

                {/* PLAYER */}
                <div>
                  <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">PLAYER</div>
                  <div className="text-xs font-bold text-slate-100 truncate max-w-[70px] mt-0.5">{userName}</div>
                </div>

                {/* TIME */}
                <div>
                  <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">TIME</div>
                  <div className="text-xs font-bold text-rose-400 font-mono mt-0.5">{formatTimeDigital(elapsedSeconds)}</div>
                </div>

                {/* TARGET */}
                <div>
                  <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">TARGET</div>
                  <div className="text-xs font-bold text-emerald-400 flex items-center gap-1 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
                    {redBrokenCount}/3
                  </div>
                </div>
              </div>

              {/* 우측 상단 제어 버튼들 */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleTogglePause}
                  disabled={gameState === "ready"}
                  title={gameState === "paused" ? "계속하기" : "일시정지"}
                  className="w-8 h-8 rounded-lg bg-[#232736] hover:bg-slate-700 flex items-center justify-center text-slate-300 transition-colors cursor-pointer"
                >
                  {gameState === "paused" ? <Play className="w-3.5 h-3.5 fill-white" /> : <Pause className="w-3.5 h-3.5 fill-white" />}
                </button>
                <button
                  onClick={handleRestart}
                  title="다시 시작"
                  className="w-8 h-8 rounded-lg bg-[#232736] hover:bg-slate-700 flex items-center justify-center text-slate-300 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={handleQuitGame}
                  title="게임 종료 (첫 화면)"
                  className="w-8 h-8 rounded-lg bg-[#232736] hover:bg-rose-900/60 flex items-center justify-center text-rose-400 hover:text-rose-200 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 캔버스 화면 */}
            <div className="relative rounded-2xl overflow-hidden bg-[#10121a] w-full flex justify-center shadow-inner">
              <canvas
                ref={canvasRef}
                width={440}
                height={460}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                className="block max-w-full h-auto touch-none"
              />

              {/* 3, 2, 1 카운트다운 */}
              {gameState === "ready" && countdown !== null && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center">
                  <div className="text-6xl font-black text-amber-400 animate-ping">
                    {countdown}
                  </div>
                </div>
              )}

              {/* 일시정지 오버레이 */}
              {gameState === "paused" && (
                <div className="absolute inset-0 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center">
                  <h3 className="text-lg font-bold text-slate-200 mb-3">PAUSED</h3>
                  <button
                    onClick={handleTogglePause}
                    className="py-2 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                  >
                    계속하기
                  </button>
                </div>
              )}

              {/* 실패 오버레이 */}
              {gameState === "gameover" && (
                <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center animate-in zoom-in-95 duration-200">
                  <h3 className="text-xl font-black text-rose-500 mb-1">게임 미션 실패</h3>
                  <p className="text-xs text-slate-400 mb-5">모든 생명을 소진하였습니다.</p>
                  <button
                    onClick={handleQuitGame}
                    className="py-2 px-5 rounded-xl bg-[#232736] hover:bg-slate-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    처음 화면으로
                  </button>
                </div>
              )}

              {/* 성공 오버레이 */}
              {gameState === "cleared" && (
                <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center animate-in zoom-in-95 duration-200">
                  <div className="text-4xl mb-2">🎉</div>
                  <h3 className="text-xl font-black text-emerald-400 mb-1">게임 미션 성공!</h3>
                  <p className="text-xs text-slate-400 mb-4">빨간 벽돌 3개를 모두 제거했습니다!</p>

                  <div className="bg-[#1e2230] rounded-xl px-5 py-2.5 mb-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-400">완료 시간</div>
                    <div className="text-xl font-bold text-rose-400 font-mono">{clearedTimeText}</div>
                  </div>

                  <p className="text-[11px] text-slate-400 mb-4">
                    {isSavingRank ? "구글 시트에 기록 저장 중..." : "구글 시트에 기록이 저장되었습니다!"}
                  </p>

                  <button
                    onClick={handleRestart}
                    className="py-2 px-6 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-colors cursor-pointer"
                  >
                    다시 하기
                  </button>
                </div>
              )}
            </div>

            {/* 하단 조작 힌트 */}
            <div className="mt-3 text-[11px] text-slate-400 text-center">
              PC: 방향키(◀, ▶) | 모바일: 스와이프로 패들 이동
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
