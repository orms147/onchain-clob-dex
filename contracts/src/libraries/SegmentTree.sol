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

}
