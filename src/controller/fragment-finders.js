import BinarySearch from '../utils/binary-search';

/**
 * Calculates the PDT of the next load position. This calculation is either based on the PDT of the previous frag, or
 * the estimated start PDT of the entire level. Calculating from the previous frag is preferable since it is able to deal
 * with large gaps in PDT following discontinuities.
 * @param {number} start - The PTS of the first fragment within the level
 * @param {number} bufferEnd - The end of the contiguous buffered range the playhead is currently within
 * @param {*} fragPrevious - The last frag successfully appended
 * @param {*} levelDetails - An object containing the parsed and computed properties of the currently playing level
 * @returns {number} nextPdt - The computed PDT
 */
export function calculateNextPdt (start, bufferEnd, fragPrevious, levelDetails) {
  let nextPdt = 0;
  if (fragPrevious && fragPrevious.pdt) {
    nextPdt = this.fragPrevious.pdt + (this.fragPrevious.duration * 1000);
  } else if (levelDetails.programDateTime) {
    nextPdt = (bufferEnd * 1000) + Date.parse(levelDetails.programDateTime) - (1000 * start);
  }
  return nextPdt;
}

/**
 * Finds the first fragment whose endPDT value exceeds the given PDT.
 * @param {Array} fragments - The array of candidate fragments
 * @param {number} PDTValue - The PDT value which must be exceeded
 * @returns {*} fragment - The best matching fragment
 */
export function findFragmentByPDT (fragments, PDTValue) {
  if (!fragments || !PDTValue) {
    return null;
  }

  // if less than start
  let firstSegment = fragments[0];

  if (PDTValue < firstSegment.pdt) {
    return null;
  }

  let lastSegment = fragments[fragments.length - 1];

  if (PDTValue >= lastSegment.endPdt) {
    return null;
  }

  for (let seg = 0; seg < fragments.length; ++seg) {
    let frag = fragments[seg];
    if (PDTValue < frag.endPdt) {
      return frag;
    }
  }
  return null;
}

/**
 * Finds a fragment based on the SN of the previous fragment; or based on the needs of the current buffer.
 * This method compensates for small buffer gaps by applying a tolerance to the start of any candidate fragment, thus
 * breaking any traps which would cause the same fragment to be continuously selected within a small range.
 * @param {*} fragPrevious - The last frag successfully appended
 * @param {Array} fragments - The array of candidate fragments
 * @param {number} bufferEnd - The end of the contiguous buffered range the playhead is currently within
 * @param {number} end - The computed end time of the stream
 * @returns {*} foundFrag - The best matching fragment
 */
export function findFragmentBySN (fragPrevious, fragments, bufferEnd, end) {
  const config = this.hls.config;
  let foundFrag;
  let maxFragLookUpTolerance = config.maxFragLookUpTolerance;
  const fragNext = fragPrevious ? fragments[fragPrevious.sn - fragments[0].sn + 1] : null;
  let fragmentWithinToleranceTest = (candidate) => {
    // offset should be within fragment boundary - config.maxFragLookUpTolerance
    // this is to cope with situations like
    // bufferEnd = 9.991
    // frag[Ø] : [0,10]
    // frag[1] : [10,20]
    // bufferEnd is within frag[0] range ... although what we are expecting is to return frag[1] here
    //              frag start               frag start+duration
    //                  |-----------------------------|
    //              <--->                         <--->
    //  ...--------><-----------------------------><---------....
    // previous frag         matching fragment         next frag
    //  return -1             return 0                 return 1
    // logger.log(`level/sn/start/end/bufEnd:${level}/${candidate.sn}/${candidate.start}/${(candidate.start+candidate.duration)}/${bufferEnd}`);
    // Set the lookup tolerance to be small enough to detect the current segment - ensures we don't skip over very small segments
    let candidateLookupTolerance = Math.min(maxFragLookUpTolerance, candidate.duration + (candidate.deltaPTS ? candidate.deltaPTS : 0));
    if (candidate.start + candidate.duration - candidateLookupTolerance <= bufferEnd) {
      return 1;
    } else if (candidate.start - candidateLookupTolerance > bufferEnd && candidate.start) {
      // if maxFragLookUpTolerance will have negative value then don't return -1 for first element
      return -1;
    }

    return 0;
  };

  if (bufferEnd < end) {
    if (bufferEnd > end - maxFragLookUpTolerance) {
      maxFragLookUpTolerance = 0;
    }

    // Prefer the next fragment if it's within tolerance
    if (fragNext && !fragmentWithinToleranceTest(fragNext)) {
      foundFrag = fragNext;
    } else {
      foundFrag = BinarySearch.search(fragments, fragmentWithinToleranceTest);
    }
  }
  return foundFrag;
}
