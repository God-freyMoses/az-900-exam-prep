import React, { useState, useEffect, useCallback } from 'react';
import questionsData from './data/questions.json';

const QUESTIONS_PER_SESSION = Math.ceil(questionsData.questions.length / 4);
const PASS_THRESHOLD = 70;

function App() {
  const [currentView, setCurrentView] = useState('sessions'); // sessions, quiz, results
  const [currentSession, setCurrentSession] = useState(1);
  const [sessionQuestions, setSessionQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [answers, setAnswers] = useState({});
  const [sessionResults, setSessionResults] = useState(null);
  const [wrongQuestionIds, setWrongQuestionIds] = useState([]);
  const [sessionAttempts, setSessionAttempts] = useState({});
  const [lastQuestionIndex, setLastQuestionIndex] = useState({}); // Track last question index per session

  // Load progress from localStorage
  useEffect(() => {
    const savedProgress = localStorage.getItem('az900_progress');
    if (savedProgress) {
      const progress = JSON.parse(savedProgress);
      setAnswers(progress.answers || {});
      setWrongQuestionIds(progress.wrongQuestionIds || []);
      setSessionAttempts(progress.sessionAttempts || {});
      setLastQuestionIndex(progress.lastQuestionIndex || {});
    }
  }, []);

  // Save progress to localStorage
  const saveProgress = useCallback(() => {
    const progress = {
      answers,
      wrongQuestionIds,
      sessionAttempts,
      lastQuestionIndex
    };
    localStorage.setItem('az900_progress', JSON.stringify(progress));
  }, [answers, wrongQuestionIds, sessionAttempts, lastQuestionIndex]);

  useEffect(() => {
    if (Object.keys(answers).length > 0 || wrongQuestionIds.length > 0) {
      saveProgress();
    }
  }, [answers, wrongQuestionIds, saveProgress]);

  // Get session status
  const getSessionStatus = (sessionNum) => {
    const attemptData = sessionAttempts[sessionNum];
    if (!attemptData) return 'available';
    if (attemptData.passed) return 'completed';
    return 'in-progress';
  };

  // Get questions for a session
  const getSessionQuestions = (sessionNum) => {
    // Filter questions by session
    let sessionQs = questionsData.questions.filter(q => q.session === sessionNum);
    
    // If this is a retry (has wrong questions), add wrong questions from previous attempts
    if (sessionAttempts[sessionNum]?.wrongQuestions?.length > 0) {
      const wrongQs = sessionAttempts[sessionNum].wrongQuestions;
      const wrongQsData = questionsData.questions.filter(q => wrongQs.includes(q.id));
      // Add wrong questions to the end
      sessionQs = [...sessionQs, ...wrongQsData];
    }
    
    return sessionQs;
  };

  // Start a session
  const startSession = (sessionNum) => {
    const questions = getSessionQuestions(sessionNum);
    const savedIndex = lastQuestionIndex[sessionNum] || 0;
    
    setCurrentSession(sessionNum);
    setSessionQuestions(questions);
    setCurrentQuestionIndex(savedIndex);
    
    // Check if current question was already answered - restore state if so
    const currentQ = questions[savedIndex];
    if (currentQ && answers[currentQ.id]) {
      setSelectedAnswer(answers[currentQ.id].selected);
      setShowExplanation(true);
    } else {
      setSelectedAnswer(null);
      setShowExplanation(false);
    }
    
    setCurrentView('quiz');
  };

  // Get current question
  const currentQuestion = sessionQuestions[currentQuestionIndex];

  // Handle answer selection
  const handleAnswerSelect = (index) => {
    if (showExplanation) return;
    setSelectedAnswer(index);
  };

  // Submit answer
  const submitAnswer = () => {
    if (selectedAnswer === null) return;
    
    const isCorrect = Array.isArray(currentQuestion.correctAnswer)
      ? JSON.stringify(selectedAnswer) === JSON.stringify(currentQuestion.correctAnswer)
      : selectedAnswer === currentQuestion.correctAnswer;

    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: {
        selected: selectedAnswer,
        correct: isCorrect
      }
    }));

    if (!isCorrect) {
      setWrongQuestionIds(prev => [...prev, currentQuestion.id]);
    }

    setShowExplanation(true);
    
    // Save progress immediately after submitting answer
    const newLastIndex = { ...lastQuestionIndex, [currentSession]: currentQuestionIndex };
    setLastQuestionIndex(newLastIndex);
    const progress = {
      answers: { ...answers, [currentQuestion.id]: { selected: selectedAnswer, correct: isCorrect } },
      wrongQuestionIds: isCorrect ? wrongQuestionIds : [...wrongQuestionIds, currentQuestion.id],
      sessionAttempts,
      lastQuestionIndex: newLastIndex
    };
    localStorage.setItem('az900_progress', JSON.stringify(progress));
  };

  // Navigate to next question
  const nextQuestion = () => {
    if (currentQuestionIndex < sessionQuestions.length - 1) {
      const newIndex = currentQuestionIndex + 1;
      setCurrentQuestionIndex(newIndex);
      // Save progress so user can resume if they leave
      setLastQuestionIndex(prev => ({ ...prev, [currentSession]: newIndex }));
      setSelectedAnswer(null);
      setShowExplanation(false);
    } else {
      // End of session - clear the saved question index
      setLastQuestionIndex(prev => ({ ...prev, [currentSession]: 0 }));
      calculateResults();
    }
  };

  // Calculate session results
  const calculateResults = () => {
    const sessionAnswers = Object.entries(answers).filter(([qId, data]) => {
      const q = questionsData.questions.find(question => question.id === parseInt(qId));
      return q && q.session === currentSession;
    });

    const totalQuestions = sessionQuestions.length;
    const correctCount = sessionAnswers.filter(([, data]) => data.correct).length;
    const percentage = (correctCount / totalQuestions) * 100;
    const passed = percentage >= PASS_THRESHOLD;

    // Get wrong question IDs
    const wrongQs = sessionAnswers
      .filter(([, data]) => !data.correct)
      .map(([qId]) => parseInt(qId));

    // Update session attempts
    const newAttempts = {
      ...sessionAttempts,
      [currentSession]: {
        passed,
        percentage,
        correctCount,
        totalQuestions,
        wrongQuestions: wrongQs,
        attempts: (sessionAttempts[currentSession]?.attempts || 0) + 1
      }
    };
    setSessionAttempts(newAttempts);

    setSessionResults({
      percentage,
      passed,
      correctCount,
      totalQuestions,
      wrongQuestions: wrongQs
    });
    setCurrentView('results');
  };

  // Restart session (for wrong answers)
  const retrySession = () => {
    const questions = getSessionQuestions(currentSession);
    setSessionQuestions(questions);
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setShowExplanation(false);
    setSessionResults(null);
    // Reset last question index for this session
    const newLastIndex = { ...lastQuestionIndex, [currentSession]: 0 };
    setLastQuestionIndex(newLastIndex);
    // Save progress immediately
    const progress = {
      answers,
      wrongQuestionIds,
      sessionAttempts,
      lastQuestionIndex: newLastIndex
    };
    localStorage.setItem('az900_progress', JSON.stringify(progress));
    setCurrentView('quiz');
  };

  // Back to sessions - save current progress first
  const backToSessions = () => {
    // Save current question index so user can resume later
    if (currentView === 'quiz' && currentQuestionIndex > 0) {
      const newLastIndex = { ...lastQuestionIndex, [currentSession]: currentQuestionIndex };
      setLastQuestionIndex(newLastIndex);
      // Save progress immediately
      const progress = {
        answers,
        wrongQuestionIds,
        sessionAttempts,
        lastQuestionIndex: newLastIndex
      };
      localStorage.setItem('az900_progress', JSON.stringify(progress));
    }
    setCurrentView('sessions');
    setSessionResults(null);
  };

  // Get progress stats
  const getProgressStats = () => {
    const totalAnswered = Object.keys(answers).length;
    const totalCorrect = Object.values(answers).filter(a => a.correct).length;
    return { totalAnswered, totalCorrect };
  };

  // Render session selector
  const renderSessionSelector = () => {
    const stats = getProgressStats();
    
    return (
      <div className="sessions-container">
        <div className="dashboard-header">
          <h2>AZ-900 Exam Prep</h2>
          <div className="progress-bar" style={{ width: '200px' }}>
            <div 
              className="progress-fill" 
              style={{ width: `${(stats.totalCorrect / questionsData.questions.length) * 100}%` }}
            />
          </div>
          <span className="progress-text">{stats.totalCorrect}/{questionsData.questions.length} Correct</span>
        </div>

        <div className="sessions-grid">
          {[1, 2, 3, 4].map(sessionNum => {
            const status = getSessionStatus(sessionNum);
            const attemptData = sessionAttempts[sessionNum];
            const sessionQuestionCount = questionsData.questions.filter(q => q.session === sessionNum).length;
            
            return (
              <div 
                key={sessionNum}
                className={`session-card ${status}`}
                onClick={() => status !== 'locked' && startSession(sessionNum)}
              >
                <div className="session-number">Session {sessionNum}</div>
                <div className="session-title">{sessionQuestionCount} Questions</div>
                {attemptData && (
                  <div className="session-detail">
                    Best: {attemptData.percentage.toFixed(1)}% - {attemptData.attempts} attempt(s)
                  </div>
                )}
                <span className={`session-status ${status}`}>
                  {status === 'available' && 'Ready'}
                  {status === 'locked' && 'Locked'}
                  {status === 'in-progress' && 'In Progress'}
                  {status === 'completed' && 'Passed ✓'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Render quiz question
  const renderQuiz = () => {
    if (!currentQuestion) return null;

    const questionNumber = currentQuestionIndex + 1;
    const totalInSession = sessionQuestions.length;
    const sessionCorrect = Object.entries(answers)
      .filter(([qId, data]) => {
        const q = questionsData.questions.find(question => question.id === parseInt(qId));
        return q && q.session === currentSession && data.correct;
      }).length;

    return (
      <div className="question-container">
        <div className="question-header">
          <span className="question-badge">Session {currentSession}</span>
          <span className="question-progress">
            Question {questionNumber} of {totalInSession} • {sessionCorrect} Correct
          </span>
        </div>

        <div className="question-text">{currentQuestion.question}</div>

        <div className="answers-grid">
          {currentQuestion.options.map((option, index) => {
            let className = 'answer-option';
            if (showExplanation) {
              if (index === currentQuestion.correctAnswer || 
                  (Array.isArray(currentQuestion.correctAnswer) && currentQuestion.correctAnswer.includes(index))) {
                className += ' correct';
              } else if (index === selectedAnswer) {
                className += ' incorrect';
              }
              className += ' disabled';
            } else if (selectedAnswer === index) {
              className += ' selected';
            }

            return (
              <div
                key={index}
                className={className}
                onClick={() => handleAnswerSelect(index)}
              >
                <span className="answer-letter">
                  {String.fromCharCode(65 + index)}
                </span>
                <span className="answer-text">{option}</span>
              </div>
            );
          })}
        </div>

        {showExplanation && (
          <div className="explanation-panel">
            <div className="explanation-title">Explanation</div>
            <div className="explanation-section">
              <h4>Concept Tested</h4>
              <p>{currentQuestion.explanation.concept}</p>
            </div>
            <div className="explanation-section">
              <h4>Why Correct Answer is Correct</h4>
              <p>{currentQuestion.explanation.whyCorrect}</p>
            </div>
            <div className="explanation-section">
              <h4>Why Incorrect Answers are Incorrect</h4>
              <p>{currentQuestion.explanation.whyIncorrect}</p>
            </div>
          </div>
        )}

        <div className="nav-buttons">
          <button 
            className="btn btn-secondary"
            onClick={backToSessions}
          >
            ← Back to Sessions
          </button>
          
          {!showExplanation ? (
            <button 
              className="btn btn-primary"
              onClick={submitAnswer}
              disabled={selectedAnswer === null}
            >
              Submit Answer
            </button>
          ) : (
            <button 
              className="btn btn-primary"
              onClick={nextQuestion}
            >
              {currentQuestionIndex < sessionQuestions.length - 1 ? 'Next Question' : 'See Results'} →
            </button>
          )}
        </div>
      </div>
    );
  };

  // Render results
  const renderResults = () => {
    if (!sessionResults) return null;

    const { percentage, passed, correctCount, totalQuestions, wrongQuestions } = sessionResults;

    return (
      <div className="modal-overlay">
        <div className="modal">
          <div className={`modal-icon ${passed ? 'success' : 'failure'}`}>
            {passed ? '✓' : '✗'}
          </div>
          <h2>{passed ? 'Congratulations!' : 'Keep Practicing!'}</h2>
          <div className={`modal-score ${passed ? 'pass' : 'fail'}`}>
            {percentage.toFixed(1)}%
          </div>
          <p className="modal-message">
            {passed 
              ? 'You have passed this session with 95%+ accuracy!'
              : 'You need 95% to pass. Review the questions you got wrong and try again.'}
          </p>
          
          <div className="modal-stats">
            <div className="stat-item">
              <div className="stat-value correct">{correctCount}</div>
              <div className="stat-label">Correct</div>
            </div>
            <div className="stat-item">
              <div className="stat-value incorrect">{totalQuestions - correctCount}</div>
              <div className="stat-label">Incorrect</div>
            </div>
          </div>

          {!passed && wrongQuestions.length > 0 && (
            <p style={{ marginBottom: '20px', color: '#666' }}>
              {wrongQuestions.length} questions will appear again in your next attempt.
            </p>
          )}

          <div className="btn-group">
            <button className="btn btn-secondary" onClick={backToSessions}>
              Back to Sessions
            </button>
            {!passed && (
              <button className="btn btn-primary" onClick={retrySession}>
                Retry Session
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-content">
          <div className="logo">
            <div className="logo-icon">AZ</div>
            <h1>AZ-900 Exam Prep</h1>
          </div>
          <div className="header-progress">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${(getProgressStats().totalCorrect / questionsData.questions.length) * 100}%` }}
              />
            </div>
            <span className="progress-text">
              {getProgressStats().totalCorrect}/{questionsData.questions.length}
            </span>
          </div>
        </div>
      </header>

      {currentView === 'sessions' && renderSessionSelector()}
      {currentView === 'quiz' && renderQuiz()}
      {currentView === 'results' && renderResults()}
    </div>
  );
}

export default App;
