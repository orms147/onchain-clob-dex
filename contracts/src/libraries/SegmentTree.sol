// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title SegmentTree
 * @notice A highly gas-efficient, two-level bitmap index for finding active price ticks
 * @dev Enhanced version with better bit manipulation and error handling
 */
library SegmentTree {
    // Each segment manages 256 ticks
    uint256 private constant SEGMENT_SIZE = 256;
    uint256 private constant MAX_SEGMENT_INDEX = 255;
    uint256 private constant MAX_POSITION = 255;
    
    // Error codes
    uint256 private constant INDEX_ERROR = 0;
    uint256 private constant EMPTY_TREE_ERROR = 1;
    uint256 private constant OVERFLOW_ERROR = 2;

    error SegmentTreeError(uint256 errorCode);

    struct Tree {
        // Level 1: A 256-bit bitmap. Each bit represents a segment.
        // If bit `i` = 1, segment `i` has liquidity.
        uint256 root;

        // Level 2: Mapping from segment index to another 256-bit bitmap.
        // This bitmap shows which specific ticks in that segment have liquidity.
        mapping(uint256 => uint256) segments;
        
        // Additional metadata
        uint256 totalTicks; // Total number of active ticks
        uint256 minTick;    // Cached minimum tick
        uint256 maxTick;    // Cached maximum tick
        bool hasCache;      // Whether cache is valid
    }

    /**
     * @notice Mark a tick as having liquidity
     * @param tree The segment tree
     * @param tick The price tick index
     */
    function setTick(Tree storage tree, uint256 tick) internal {
        uint256 segmentIndex = tick / SEGMENT_SIZE;
        uint256 positionInSegment = tick % SEGMENT_SIZE;

        // Bounds checking
        if (segmentIndex > MAX_SEGMENT_INDEX) {
            revert SegmentTreeError(INDEX_ERROR);
        }

        uint256 tickMask = 1 << positionInSegment;
        uint256 segmentMask = 1 << segmentIndex;
        
        // Check if tick already exists
        bool tickExists = (tree.segments[segmentIndex] & tickMask) != 0;
        
        if (!tickExists) {
            // Set bit for specific tick in corresponding segment
            tree.segments[segmentIndex] |= tickMask;
            
            // Set bit for the segment in root
            tree.root |= segmentMask;
            
            // Update metadata
            unchecked {
                tree.totalTicks++;
            }
            _invalidateCache(tree);
        }
    }

    /**
     * @notice Mark a tick as having no liquidity
     * @param tree The segment tree
     * @param tick The price tick index
     */
    function clearTick(Tree storage tree, uint256 tick) internal {
        uint256 segmentIndex = tick / SEGMENT_SIZE;
        uint256 positionInSegment = tick % SEGMENT_SIZE;

        // Bounds checking
        if (segmentIndex > MAX_SEGMENT_INDEX) {
            revert SegmentTreeError(INDEX_ERROR);
        }

        uint256 tickMask = 1 << positionInSegment;
        uint256 segmentMask = 1 << segmentIndex;
        
        // Check if tick exists
        bool tickExists = (tree.segments[segmentIndex] & tickMask) != 0;
        
        if (tickExists) {
            // Clear bit for specific tick
            tree.segments[segmentIndex] &= ~tickMask;
            
            // If entire segment becomes empty, clear bit in root
            if (tree.segments[segmentIndex] == 0) {
                tree.root &= ~segmentMask;
            }
            
            // Update metadata
            unchecked {
                tree.totalTicks--;
            }
            _invalidateCache(tree);
        }
    }

    /**
     * @notice Check if a tick has liquidity
     * @param tree The segment tree
     * @param tick The price tick index
     * @return hasLiquidity True if tick has liquidity
     */
    function hasTick(Tree storage tree, uint256 tick) internal view returns (bool) {
        uint256 segmentIndex = tick / SEGMENT_SIZE;
        uint256 positionInSegment = tick % SEGMENT_SIZE;
        
        // Bounds checking
        if (segmentIndex > MAX_SEGMENT_INDEX) {
            return false;
        }
        
        return (tree.segments[segmentIndex] & (1 << positionInSegment)) != 0;
    }

    /**
     * @notice Find highest tick with liquidity (best bid)
     * @param tree The segment tree
     * @return success True if found
     * @return tick The highest tick with liquidity
     */
    function getHighestTick(Tree storage tree) internal view returns (bool success, uint256 tick) {
        if (tree.root == 0) {
            return (false, 0);
        }

        // Use cache if valid
        if (tree.hasCache) {
            return (true, tree.maxTick);
        }

        // Find highest segment with liquidity from root bitmap
        uint256 segmentIndex = _findHighestBit(tree.root);

        // Find highest tick with liquidity from that segment's bitmap
        uint256 segmentBitmap = tree.segments[segmentIndex];
        uint256 positionInSegment = _findHighestBit(segmentBitmap);

        // Combine to get final tick
        tick = segmentIndex * SEGMENT_SIZE + positionInSegment;
        return (true, tick);
    }

    /**
     * @notice Find lowest tick with liquidity (best ask)
     * @param tree The segment tree
     * @return success True if found
     * @return tick The lowest tick with liquidity
     */
    function getLowestTick(Tree storage tree) internal view returns (bool success, uint256 tick) {
        if (tree.root == 0) {
            return (false, 0);
        }

        // Use cache if valid
        if (tree.hasCache) {
            return (true, tree.minTick);
        }

        // Find lowest segment with liquidity from root bitmap
        uint256 segmentIndex = _findLowestBit(tree.root);

        // Find lowest tick with liquidity from that segment's bitmap
        uint256 segmentBitmap = tree.segments[segmentIndex];
        uint256 positionInSegment = _findLowestBit(segmentBitmap);

        // Combine to get final tick
        tick = segmentIndex * SEGMENT_SIZE + positionInSegment;
        return (true, tick);
    }

    /**
     * @notice Get next tick above given tick
     * @param tree The segment tree
     * @param tick Current tick
     * @return success True if found
     * @return nextTick Next tick with liquidity
     */
    function getNextTick(Tree storage tree, uint256 tick) internal view returns (bool success, uint256 nextTick) {
        uint256 segmentIndex = tick / SEGMENT_SIZE;
        uint256 positionInSegment = tick % SEGMENT_SIZE;

        // Check if there's a higher tick in the same segment
        if (positionInSegment < MAX_POSITION) {
            uint256 mask = ~((1 << (positionInSegment + 1)) - 1);
            uint256 segmentBitmap = tree.segments[segmentIndex] & mask;
            
            if (segmentBitmap != 0) {
                uint256 nextPosition = _findLowestBit(segmentBitmap);
                return (true, segmentIndex * SEGMENT_SIZE + nextPosition);
            }
        }

        // Search in higher segments
        if (segmentIndex < MAX_SEGMENT_INDEX) {
            uint256 rootMask = ~((1 << (segmentIndex + 1)) - 1);
            uint256 rootBitmap = tree.root & rootMask;
            
            if (rootBitmap != 0) {
                uint256 nextSegment = _findLowestBit(rootBitmap);
                uint256 nextPosition = _findLowestBit(tree.segments[nextSegment]);
                return (true, nextSegment * SEGMENT_SIZE + nextPosition);
            }
        }

        return (false, 0);
    }

    /**
     * @notice Get previous tick below given tick
     * @param tree The segment tree
     * @param tick Current tick
     * @return success True if found
     * @return prevTick Previous tick with liquidity
     */
    function getPrevTick(Tree storage tree, uint256 tick) internal view returns (bool success, uint256 prevTick) {
        uint256 segmentIndex = tick / SEGMENT_SIZE;
        uint256 positionInSegment = tick % SEGMENT_SIZE;

        // Check if there's a lower tick in the same segment
        if (positionInSegment > 0) {
            uint256 mask = (1 << positionInSegment) - 1;
            uint256 segmentBitmap = tree.segments[segmentIndex] & mask;
            
            if (segmentBitmap != 0) {
                uint256 prevPosition = _findHighestBit(segmentBitmap);
                return (true, segmentIndex * SEGMENT_SIZE + prevPosition);
            }
        }

        // Search in lower segments
        if (segmentIndex > 0) {
            uint256 rootMask = (1 << segmentIndex) - 1;
            uint256 rootBitmap = tree.root & rootMask;
            
            if (rootBitmap != 0) {
                uint256 prevSegment = _findHighestBit(rootBitmap);
                uint256 prevPosition = _findHighestBit(tree.segments[prevSegment]);
                return (true, prevSegment * SEGMENT_SIZE + prevPosition);
            }
        }

        return (false, 0);
    }

    /**
     * @notice Check if tree has any liquidity
     * @param tree The segment tree
     * @return hasLiquidity True if tree has liquidity
     */
    function hasLiquidity(Tree storage tree) internal view returns (bool) {
        return tree.root != 0;
    }

    /**
     * @notice Get total number of active ticks
     * @param tree The segment tree
     * @return count Total active ticks
     */
    function getTotalTicks(Tree storage tree) internal view returns (uint256) {
        return tree.totalTicks;
    }

    /**
     * @notice Update cache with min/max ticks
     * @param tree The segment tree
     */
    function updateCache(Tree storage tree) internal {
        if (tree.root == 0) {
            tree.hasCache = false;
            return;
        }

        // Update min tick
        uint256 minSegmentIndex = _findLowestBit(tree.root);
        uint256 minPosition = _findLowestBit(tree.segments[minSegmentIndex]);
        tree.minTick = minSegmentIndex * SEGMENT_SIZE + minPosition;

        // Update max tick
        uint256 maxSegmentIndex = _findHighestBit(tree.root);
        uint256 maxPosition = _findHighestBit(tree.segments[maxSegmentIndex]);
        tree.maxTick = maxSegmentIndex * SEGMENT_SIZE + maxPosition;

        tree.hasCache = true;
    }

    /**
     * @notice Invalidate cache
     * @param tree The segment tree
     */
    function _invalidateCache(Tree storage tree) private {
        tree.hasCache = false;
    }

    /**
     * @notice Find the position of the highest set bit using binary search
     * @param value The value to search
     * @return position The position of highest bit (0-indexed)
     */
    function _findHighestBit(uint256 value) private pure returns (uint256 position) {
        if (value == 0) revert SegmentTreeError(EMPTY_TREE_ERROR);
        
        unchecked {
            position = 0;
            if (value >= 2**128) { position += 128; value >>= 128; }
            if (value >= 2**64) { position += 64; value >>= 64; }
            if (value >= 2**32) { position += 32; value >>= 32; }
            if (value >= 2**16) { position += 16; value >>= 16; }
            if (value >= 2**8) { position += 8; value >>= 8; }
            if (value >= 2**4) { position += 4; value >>= 4; }
            if (value >= 2**2) { position += 2; value >>= 2; }
            if (value >= 2**1) { position += 1; }
        }
    }

    /**
     * @notice Find the position of the lowest set bit using isolation technique
     * @param value The value to search
     * @return position The position of lowest bit (0-indexed)
     */
    function _findLowestBit(uint256 value) private pure returns (uint256 position) {
        if (value == 0) revert SegmentTreeError(EMPTY_TREE_ERROR);
        
        unchecked {
            // Isolate the lowest set bit using two's complement
            value = value & (~value + 1);
            
            position = 0;
            if (value >= 2**128) { position += 128; value >>= 128; }
            if (value >= 2**64) { position += 64; value >>= 64; }
            if (value >= 2**32) { position += 32; value >>= 32; }
            if (value >= 2**16) { position += 16; value >>= 16; }
            if (value >= 2**8) { position += 8; value >>= 8; }
            if (value >= 2**4) { position += 4; value >>= 4; }
            if (value >= 2**2) { position += 2; value >>= 2; }
            if (value >= 2**1) { position += 1; }
        }
    }
}