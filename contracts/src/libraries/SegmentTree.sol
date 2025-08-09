// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title SegmentTree
 * @notice Optimized two-level bitmap for active price ticks within a fixed contiguous range.
 * @dev Responsibilities:
 *      - Track which ticks (price levels) are active (liquidity > 0) via bitmaps.
 *      - Provide O(1) best bid / ask retrieval (highest / lowest active tick).
 *      - Provide next / previous active tick navigation.
 *      - Range defined once via initialize(startTick, endTick).
 *
 *  NOT Responsibilities:
 *      - Storing per-tick order lists.
 *      - Cumulative liquidity math.
 *      - Matching logic.
 *
 *  Internal Representation:
 *      internalIndex = externalTick - startTick (0-based)
 *      segmentIndex = internalIndex >> 8 ( / 256 ) ; position = internalIndex & 0xFF
 */
library SegmentTree {
	// ---- Constants ----
	uint256 private constant SEGMENT_SIZE = 256;              // bits per segment (uint256)
	uint256 private constant MAX_SEGMENT_INDEX = 255;         // supports up to 256 segments => 256 * 256 = 65,536 ticks
	uint256 private constant MAX_POSITION = 255;

	// Error codes (compact) -------------------------------------------------
	uint256 private constant ERR_INDEX = 0;
	uint256 private constant ERR_EMPTY = 1;

	error SegmentTreeError(uint256 code);

	struct Tree {
		uint256 root;                               // Level-1 bitmap: 1 bit per segment if segment has ≥1 active tick
		mapping(uint256 => uint256) segments;        // Level-2: segmentIndex => 256-bit bitmap for ticks
		uint256 startTick;                          // inclusive external base tick
		uint256 endTick;                            // exclusive external end tick
		bool initialized;                           // one-time init flag
		uint256 totalTicks;                         // active tick count
		uint256 minTick;                            // cached min external tick (optional)
		uint256 maxTick;                            // cached max external tick (optional)
		bool hasCache;                              // cache validity flag
	}

	// ---- Init ----
	function initialize(Tree storage tree, uint256 startTick, uint256 endTick) internal {
		require(!tree.initialized, "SEG:init");
		require(endTick > startTick, "SEG:range");
		uint256 span = endTick - startTick; // #ticks possible
		require(span != 0 && span <= (MAX_SEGMENT_INDEX + 1) * SEGMENT_SIZE, "SEG:span");
		tree.startTick = startTick;
		tree.endTick = endTick;
		tree.initialized = true;
	}

	function isInitialized(Tree storage tree) internal view returns (bool) { return tree.initialized; }

	// ---- Internal Index Helpers ----
	function _toInternal(Tree storage tree, uint256 externalTick) private view returns (uint256 idx) {
		if (!tree.initialized || externalTick < tree.startTick || externalTick >= tree.endTick) revert SegmentTreeError(ERR_INDEX);
		unchecked { idx = externalTick - tree.startTick; }
	}

	// ---- Core Bit Operations ----
	function _set(Tree storage tree, uint256 internalIndex) private {
		uint256 segmentIndex = internalIndex >> 8; // /256
		if (segmentIndex > MAX_SEGMENT_INDEX) revert SegmentTreeError(ERR_INDEX);
		uint256 bitPos = internalIndex & 0xFF;     // %256
		uint256 tickMask = 1 << bitPos;
		uint256 segBitmap = tree.segments[segmentIndex];
		if (segBitmap & tickMask != 0) return; // already active
		// set tick bit
		tree.segments[segmentIndex] = segBitmap | tickMask;
		// ensure root segment bit
		tree.root |= (1 << segmentIndex);
		unchecked { tree.totalTicks++; }
		tree.hasCache = false;
	}

	function _clear(Tree storage tree, uint256 internalIndex) private {
		uint256 segmentIndex = internalIndex >> 8;
		if (segmentIndex > MAX_SEGMENT_INDEX) revert SegmentTreeError(ERR_INDEX);
		uint256 bitPos = internalIndex & 0xFF;
		uint256 tickMask = 1 << bitPos;
		uint256 segBitmap = tree.segments[segmentIndex];
		if (segBitmap & tickMask == 0) return; // already clear
		segBitmap &= ~tickMask;
		tree.segments[segmentIndex] = segBitmap;
		if (segBitmap == 0) {
			// clear segment bit in root
			tree.root &= ~(1 << segmentIndex);
		}
		unchecked { tree.totalTicks--; }
		tree.hasCache = false;
	}

	// ---- Public (library) API for activation ----
	function activate(Tree storage tree, uint256 externalTick) internal { _set(tree, _toInternal(tree, externalTick)); }
	function deactivate(Tree storage tree, uint256 externalTick) internal { _clear(tree, _toInternal(tree, externalTick)); }
	function hasTick(Tree storage tree, uint256 externalTick) internal view returns (bool) { return _hasInternal(tree, _toInternal(tree, externalTick)); }

	function _hasInternal(Tree storage tree, uint256 internalIndex) private view returns (bool) {
		uint256 segmentIndex = internalIndex >> 8;
		if (segmentIndex > MAX_SEGMENT_INDEX) return false;
		return (tree.segments[segmentIndex] & (1 << (internalIndex & 0xFF))) != 0;
	}

	// ---- Extremes ----
	function getLowestTick(Tree storage tree) internal view returns (bool ok, uint256 externalTick) {
		uint256 rootMap = tree.root; if (rootMap == 0) return (false, 0);
		if (tree.hasCache) return (true, tree.minTick);
		uint256 s = _lsbIndex(rootMap);
		uint256 leafBitmap = tree.segments[s];
		uint256 p = _lsbIndex(leafBitmap);
		externalTick = tree.startTick + (s * SEGMENT_SIZE + p);
		return (true, externalTick);
	}

	function getHighestTick(Tree storage tree) internal view returns (bool ok, uint256 externalTick) {
		uint256 rootMap = tree.root; if (rootMap == 0) return (false, 0);
		if (tree.hasCache) return (true, tree.maxTick);
		uint256 s = _msbIndex(rootMap);
		uint256 leafBitmap = tree.segments[s];
		uint256 p = _msbIndex(leafBitmap);
		externalTick = tree.startTick + (s * SEGMENT_SIZE + p);
		return (true, externalTick);
	}

	// ---- Navigation ----
	function getNextTick(Tree storage tree, uint256 externalTick) internal view returns (bool ok, uint256 nextExternal) {
		uint256 internalIndex = _toInternal(tree, externalTick);
		uint256 segmentIndex = internalIndex >> 8;
		uint256 pos = internalIndex & 0xFF;
		// remaining in same segment
		if (pos < MAX_POSITION) {
			uint256 maskAbove = tree.segments[segmentIndex] & (~((1 << (pos + 1)) - 1));
			if (maskAbove != 0) {
				uint256 nextPos = _lsbIndex(maskAbove);
				return (true, tree.startTick + (segmentIndex * SEGMENT_SIZE + nextPos));
			}
		}
		// higher segments
		uint256 rootMask = tree.root & (~((1 << (segmentIndex + 1)) - 1));
		if (rootMask == 0) return (false, 0);
		uint256 nextSeg = _lsbIndex(rootMask);
		uint256 leafBitmap = tree.segments[nextSeg];
		uint256 leafPos = _lsbIndex(leafBitmap);
		nextExternal = tree.startTick + (nextSeg * SEGMENT_SIZE + leafPos);
		return (true, nextExternal);
	}

	function getPrevTick(Tree storage tree, uint256 externalTick) internal view returns (bool ok, uint256 prevExternal) {
		uint256 internalIndex = _toInternal(tree, externalTick);
		uint256 segmentIndex = internalIndex >> 8;
		uint256 pos = internalIndex & 0xFF;
		if (pos > 0) {
			uint256 maskBelow = tree.segments[segmentIndex] & ((1 << pos) - 1);
			if (maskBelow != 0) {
				uint256 prevPos = _msbIndex(maskBelow);
				return (true, tree.startTick + (segmentIndex * SEGMENT_SIZE + prevPos));
			}
		}
		if (segmentIndex == 0) return (false, 0);
		uint256 rootMask = tree.root & ((1 << segmentIndex) - 1);
		if (rootMask == 0) return (false, 0);
		uint256 prevSeg = _msbIndex(rootMask);
		uint256 leafBitmap = tree.segments[prevSeg];
		uint256 leafPos = _msbIndex(leafBitmap);
		prevExternal = tree.startTick + (prevSeg * SEGMENT_SIZE + leafPos);
		return (true, prevExternal);
	}

	// ---- Cache (optional) ----
	function updateCache(Tree storage tree) internal {
		uint256 rootMap = tree.root;
		if (rootMap == 0) { tree.hasCache = false; return; }
		uint256 sMin = _lsbIndex(rootMap);
		uint256 sMax = _msbIndex(rootMap);
		uint256 pMin = _lsbIndex(tree.segments[sMin]);
		uint256 pMax = _msbIndex(tree.segments[sMax]);
		tree.minTick = tree.startTick + (sMin * SEGMENT_SIZE + pMin);
		tree.maxTick = tree.startTick + (sMax * SEGMENT_SIZE + pMax);
		tree.hasCache = true;
	}

	function totalActive(Tree storage tree) internal view returns (uint256) { return tree.totalTicks; }
	function hasAny(Tree storage tree) internal view returns (bool) { return tree.root != 0; }

	// ---- Bit Scan Helpers (msb / lsb) ----
	// Return index [0..255] of most significant set bit.
	function _msbIndex(uint256 x) private pure returns (uint256 r) {
		if (x == 0) revert SegmentTreeError(ERR_EMPTY);
		unchecked {
			if (x >> 128 != 0) { x >>= 128; r += 128; }
			if (x >> 64  != 0) { x >>= 64;  r += 64; }
			if (x >> 32  != 0) { x >>= 32;  r += 32; }
			if (x >> 16  != 0) { x >>= 16;  r += 16; }
			if (x >> 8   != 0) { x >>= 8;   r += 8; }
			if (x >> 4   != 0) { x >>= 4;   r += 4; }
			if (x >> 2   != 0) { x >>= 2;   r += 2; }
			if (x >> 1   != 0) {            r += 1; }
		}
	}

	// Return index [0..255] of least significant set bit.
	function _lsbIndex(uint256 x) private pure returns (uint256 r) {
		if (x == 0) revert SegmentTreeError(ERR_EMPTY);
		unchecked {
			// Isolate lowest bit
			x &= (~x + 1);
			if (x & type(uint128).max == 0) { x >>= 128; r += 128; }
			if (x & type(uint64).max  == 0) { x >>= 64;  r += 64; }
			if (x & 0xFFFFFFFF        == 0) { x >>= 32;  r += 32; }
			if (x & 0xFFFF            == 0) { x >>= 16;  r += 16; }
			if (x & 0xFF              == 0) { x >>= 8;   r += 8; }
			if (x & 0xF               == 0) { x >>= 4;   r += 4; }
			if (x & 0x3               == 0) { x >>= 2;   r += 2; }
			if (x & 0x1               == 0) {            r += 1; }
		}
	}
}
